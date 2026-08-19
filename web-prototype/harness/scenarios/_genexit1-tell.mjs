/**
 * 🚪 **WHAT DOES ONE HAMMER BLOW ON AN EXIT TELL YOU? — `genexit-1`, 2026-08-15.**
 *
 *   BLOWS=16 TAG=boarded node harness/playtest.mjs --view game.play \
 *     --script harness/scenarios/_genexit1-tell.mjs --port 5533 --shots \
 *     --q "plan=gen&planseed=3&seed=s0"
 *
 *   env  BLOWS=12      swings per site       TAG=…  screenshot prefix, so two arms can coexist
 *        STANDOFF=2.0  metres from the body to the face (WORK_AIM_RANGE is 2.45)
 *
 * ⚠️ `--q`, NEVER `--extra`.
 * ⚠️ **THE RUN SEED PICKS THE LOCK AND THE LOCK IS THE WHOLE EXPERIMENT.** On `planseed=3`,
 * `seed=s4` gives `beams` (the live exit starts at stage 3, boards already off, visibly a
 * framework of studs — the ONE lock where the live door does not look like its decoys) and
 * `seed=s0` gives `boarded` (stage 0 — identical to a decoy, and John's case). Derive it in bare
 * node with `chooseExit(seed, ['x.g0','x.g1','x.g2'])`; do not trust a recorded seed.
 *
 * ---------------------------------------------------------------------------------------------
 * 📋 WHAT IT MEASURED, AND WHAT LANDED — 2026-08-15, `?plan=gen&planseed=3`, hammer, power 0.5
 * ---------------------------------------------------------------------------------------------
 * ⚠️ **THE PACING IS UNCHANGED BY EVERY FIX BELOW, WHICH WAS JOHN'S EXPLICIT BOUNDARY**: no
 * health, no stage count, no lock. Both before and after, **one blow removes a FLAT 0.14 of the
 * current stage on every exit panel at every lock** — `applyHit`'s scalar arm is
 * `def.health * 0.28 * power`, a FRACTION of the stage, so `EXIT_DEFS`' 560/760/580/**3000** buys
 * nothing against a hammer and it is **8 landed blows per stage whatever the stage is**. Measured
 * identically on the 560 hp stage 0 (`seed=s0`) and the 3000 hp stage 3 (`seed=s4`). A `boarded`
 * run is ~29 landed blows ≈ 28 s at the 0.95 s cooldown; a `beams` run is 8.
 *
 *   | channel | before | after |
 *   |---|---|---|
 *   | HUD, 16 blows x 3 doors | **0 lines** | `CHAINED FROM THE OUTSIDE` on both decoys |
 *   | the face, within a stage | frozen — 20 blows, 0 changes | **20/20** (`_genexit1-frozen`) |
 *   | a refused blow's sound | identical to a landed one | zcr 144 -> 540 Hz (`_genexit1-clank`) |
 *   | the padlock on a door you are breaking | stays for ~22 of ~29 blows | dropped once it yields |
 *
 *   · **A — the HUD.** The two lines hang off `weapons.onWallHit`, whose only caller is
 *     `WeaponSystem.hitWall`; the hammer calls `panel.applyHit()` directly and has never held a
 *     `weapons` reference. **The control was already in the tree and green:** `escape.mjs` drives
 *     the NAIL GUN over the same house and reports both lines firing. Nail gun spoke, hammer was
 *     mute. Now said from `views/game.js`'s existing `onChunk`, sharing the gun's `toldAbout`.
 *   · **C — the sound.** Both arms called `playMeleeImpact(depthAt, res)` with `depth=0,
 *     barrier=false` and differed only in `blocked`; `audio.js` asks `typeof opts.barrier ===
 *     'boolean'`, i.e. *do you know?*, and a hard `false` answered yes. The scalar arm now OMITS
 *     the key. ⚠️ The obvious fix — reorder `audio.js` — was measured and **reverted**: 40 of 63
 *     real dig blows report `blocked`, so it would have put the clank on the dig.
 *   · **Debris was the only channel that separated them and still is the quietest**: live
 *     `removed 0.14 -> chunkSize 0.239` (a slab + 8 crumbs + dust); refused `0 -> 0` (one crumb,
 *     no slab, no dust — `views/game.js` floors the crumb count at 1).
 *   · 🚫 **The dressing on a CLOSED door is unchanged and must stay so.** All three wore
 *     `chain+boards`; `procedural-map.md` §2 requires exactly that. Photographed:
 *     `progress/playtest/game.play.genexit1-THREE-DOORS-boarded.png`. D fires on DAMAGE, never on
 *     state, so an untouched exit and an untouched decoy are still identical.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY. John, playing `?plan=gen` with the SLEDGEHAMMER: *"there was no exit on this house I
 * tried … there are 3 chained doors on the perimeter walls but I attacked each one many time and
 * none seemed to take damage."* Then, minutes later: *"nvm i found the exit. I needed to attack
 * the ballroom door more."*
 *
 * So the mechanic worked the whole time. The question this file asks is the one that is left:
 * **hitting the RIGHT door and hitting a DECOY — what does the game do differently, per blow,
 * and on which blow does the difference first exist?** Everything here is measured from a real
 * hammer, swung by a real mouse click, at a real station in front of the panel.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS, AND EACH ONE MUST BE ABLE TO FAIL ON EVERY RUN
 * ---------------------------------------------------------------------------------------------
 *   C1  **the pixel floor.** Two held frames of the SAME scene with no blow between them. Every
 *       "the wall changed by N px" below is a diff against this. If the floor is not ~0 the
 *       pixel columns are reported and NOT asserted on — a lottery floor is what
 *       `still.mjs` exists for and what `_jitter1-who` measured.
 *   C2  **"it refused the damage" vs "I never hit it".** Every blow records BOTH the player's own
 *       `_lastSledgeHit.hadPanel` AND a chained `onChunk` hook on the target panel itself. A
 *       swing that never reached the panel is a MISS row and is never counted as a refusal.
 *   C3  **the probe can see a change when there is one.** The same ledger is driven against an
 *       ordinary DIG FACE, which must move both the panel's own numbers and a large number of
 *       pixels. If that row is flat, this file is blind and every zero above it is void.
 *   C4  **the comparator can see a tell when there is one.** The dressing is read from the live
 *       `exterior.census()`, and the same connectors are re-asked in `tells=marked` through
 *       `connectors.js`'s own function — which MUST come back different. A "they all look the
 *       same" result from a comparator that always says that is worth nothing.
 *
 * ⚠️ **THRESHOLD 16 IS BLIND IN A GENERATED HOUSE** — `dressfix-1`, this morning: a generated
 * room carries no light rig, the frame lives at mean luma ~6 of 255, and a 26 m chain measured
 * EIGHT pixels at `px>16`. Counts are reported at four thresholds and the floor is quoted beside
 * every one of them.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THE WHOLE-FRAME PIXEL COLUMN IS REPORTED AND MUST NOT BE ASSERTED ON. IT MEASURES THE
 * ROOM'S BREATHING LIGHTS, NOT THE WALL — MEASURED TWICE, AND `escape.md` ALREADY SAID SO.**
 * ---------------------------------------------------------------------------------------------
 * The same-config FLOOR is a clean **0/0/0/0** at every station on both runs, so `hold()` is
 * working perfectly. The after-N numbers are still junk, and the giveaway is that they are not
 * MONOTONE and their bounding box is the whole screen: on one decoy, taking **zero** damage,
 * after 1 blow read **2 802 px>2** and after 3 blows read **787 460** — a wall that cannot change
 * cannot do that. `hold()` empties `engine._updaters`, which stops the room's breathing lights
 * wherever their phase happens to be, and `escape.md`'s exterior section already records that the
 * breathing moves the WHOLE FRAME by ±8 luma and that *"whole-frame diffs are useless here:
 * measure the strip, not the frame."*
 *
 * 🎯 **SO THE PICTURE QUESTION IS ASKED SOMEWHERE ELSE, OF THE WALL ITSELF.**
 * `harness/scenarios/_genexit1-frozen.mjs` reads `material.userData.breakUniforms.uBreak.value` —
 * the four floats that ARE a scalar panel's damage — which no light can move. Use that file for
 * "did the face change"; use this one for the ledger, the HUD, the audio's inputs and the frames.
 */

import { decodePng } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const BLOWS = +(process.env.BLOWS ?? 12);
const STANDOFF = +(process.env.STANDOFF ?? 2.0);
const TH = [2, 4, 8, 16];
/** Prefix for every screenshot, so two arms in one session cannot overwrite each other. */
const TAG = process.env.TAG ? `${process.env.TAG}-` : '';

function pxdiff(a, b) {
  const ch = a.channels;
  const n = [0, 0, 0, 0];
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, sum = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * ch;
      let m = 0;
      for (let k = 0; k < 3; k++) { const d = Math.abs(a.data[i + k] - b.data[i + k]); if (d > m) m = d; }
      sum += m;
      for (let t = 0; t < TH.length; t++) if (m > TH[t]) n[t]++;
      if (m > TH[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return { n, mean: +(sum / (a.width * a.height)).toFixed(3), box: n[0] ? `${x0},${y0}..${x1},${y1}` : '-' };
}

function luma(img) {
  const ch = img.channels;
  let s = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    s += 0.2126 * img.data[i * ch] + 0.7152 * img.data[i * ch + 1] + 0.0722 * img.data[i * ch + 2];
  }
  return +(s / (img.width * img.height)).toFixed(2);
}

export default async function genexit1tell(ctx) {
  const { page, note, pass, fail, skip, snap, SHOTDIR, VIEW } = ctx;
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 900; i++) {
      await page.waitForTimeout(35);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  // a click to take pointer lock / start audio, exactly as every other scenario here does
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const wired = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.run || !e.exits || !e.player) return null;
    window.__gx = { chunks: [], last: null, hud: [] };
    // ⚠️ CHAINED, NEVER REPLACED. `views/game.js` owns `onChunk` (slab + crumbs + dust) and this
    // must not change one thing the player sees — it only records that a blow reached THIS panel.
    for (const p of e.room.panels) {
      const orig = p.onChunk;
      p.onChunk = (panel, info) => {
        window.__gx.chunks.push({ id: panel.id, removed: +(info.removed ?? 0).toFixed(4),
          blocked: !!info.blocked, chunkSize: +(info.chunkSize ?? 0).toFixed(3), kind: info.kind });
        return orig?.(panel, info);
      };
    }
    return { plan: new URLSearchParams(location.search).get('plan') ?? 'authored',
      planseed: new URLSearchParams(location.search).get('planseed') ?? '-',
      seed: String(e.run.seed), exits: e.exits.length };
  });
  if (!wired) { fail('the driver can reach the run state and the exit pool', 'engine.run / engine.exits missing'); return; }

  // =========================================================================
  // G1 · THE CENSUS — what the house's exits are, and what they are WEARING
  // =========================================================================
  const cen = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const dress = e.exterior?.census?.() ?? null;
    const byId = new Map((dress?.plan ?? []).map((r) => [r.id, r]));
    return {
      tells: dress?.tells ?? null, rule: dress?.dressRule ?? null,
      exitId: run.exitId, lock: run.lock.id, start: run.lock.startStage, phase: run.phase,
      sites: e.exits.map((x) => {
        const p = x.panel, d = byId.get(x.site.id) ?? {};
        return {
          id: x.site.id, name: x.site.name ?? x.panel.state.def?.name ?? null,
          owner: x.site.a, live: run.isLiveExit(x.site.id),
          stage: p.state.stage, hp: +p.state.stageHealth.toFixed(1),
          full: p.state.def?.health ?? null, defs: p.state.defs.length,
          damageable: p.state.isDamageable(), blocks: p.blocksMovement(),
          sight: p.blocksSight(), field: !!p.field,
          dress: { chain: !!d.chain, boards: !!d.boards, seam: !!d.seam, mortar: !!d.mortar,
            variant: d.variant ?? null },
        };
      }),
    };
  });
  note(`house: plan=${wired.plan} planseed=${wired.planseed} · run seed "${cen.exitId ? wired.seed : wired.seed}"`
    + ` · tells=${cen.tells} · dressRule=${cen.rule}`);
  note(`plan: live ${cen.exitId} · lock "${cen.lock}" (starts at stage ${cen.start})`);
  for (const s of cen.sites) {
    note(`  ${s.id.padEnd(16)} ${(s.live ? 'LIVE' : 'chained').padEnd(8)} room=${String(s.owner).padEnd(10)}`
      + ` stage ${s.stage} hp ${s.hp}/${s.full} dmgable=${s.damageable} field=${s.field}`
      + ` · wears ${['chain', 'boards', 'seam', 'mortar'].filter((k) => s.dress[k]).join('+') || 'NOTHING'}`
      + ` timber=${s.dress.variant}`);
  }
  const liveSite = cen.sites.find((s) => s.live);
  const chained = cen.sites.filter((s) => !s.live);
  if (!liveSite) { fail('this house has exactly one live exit', `${cen.sites.length} sites, none live`); return; }
  if (!chained.length) { fail('this house has chained decoys to compare against', '0 chained sites'); return; }
  pass('the house has one live exit and chained decoys',
    `${cen.sites.length} sites; live ${liveSite.id} at lock "${cen.lock}" (stage ${cen.start}); ${chained.length} chained`);

  // ---- G1b · IS THERE ANY DRESSING DIFFERENCE BETWEEN LIVE AND CHAINED AT ALL?
  const key = (d) => ['chain', 'boards', 'seam', 'mortar'].map((k) => (d[k] ? k[0] : '-')).join('');
  const liveKey = key(liveSite.dress);
  const chainKeys = [...new Set(chained.map((s) => key(s.dress)))];
  const marked = await page.evaluate(async () => {
    // C4 — the comparator's own control. Ask `connectors.js` the SAME question in `marked`,
    // where a tell is known to exist, and require a different answer. If this comes back
    // identical too, the comparator cannot see a tell and the finding above is worthless.
    let m;
    try { m = await import('/src/game/connectors.js'); } catch (err) { return { err: String(err) }; }
    const e = window.__rrr.engine, seed = e.run.seed;
    const id = e.run.exitId;
    const asExit = m.connectorDressing(id, seed, 'marked', m.CONNECTOR.EXIT, true);
    const asChained = m.connectorDressing(id, seed, 'marked', m.CONNECTOR.CHAINED, true);
    const blindExit = m.connectorDressing(id, seed, 'blind', m.CONNECTOR.EXIT, true);
    const blindChained = m.connectorDressing(id, seed, 'blind', m.CONNECTOR.CHAINED, true);
    const k = (d) => ['chain', 'boards', 'seam', 'mortar'].map((q) => (d[q] ? q[0] : '-')).join('');
    return { markedExit: k(asExit), markedChained: k(asChained), blindExit: k(blindExit), blindChained: k(blindChained) };
  });
  note(`dressing keys (chain/boards/seam/mortar): LIVE ${liveKey} · chained ${chainKeys.join(' , ')}`);
  note(`comparator control — same connector asked in marked: EXIT ${marked.markedExit} vs CHAINED ${marked.markedChained}`
    + ` · in blind: ${marked.blindExit} vs ${marked.blindChained}`);
  if (marked.err) skip('the dressing comparator can see a tell when there is one', marked.err);
  else if (marked.markedExit === marked.markedChained)
    fail('the dressing comparator can see a tell when there is one',
      'marked gives the same key for EXIT and CHAINED — the comparator is blind, ignore the row below');
  else {
    pass('the dressing comparator can see a tell when there is one',
      `marked: EXIT ${marked.markedExit} != CHAINED ${marked.markedChained}`);
    const same = chainKeys.length === 1 && chainKeys[0] === liveKey;
    same
      ? fail('the live exit is dressed differently from its decoys',
        `every site wears "${liveKey}" — under tells=${cen.tells} + rule "${cen.rule}" the padlock says NOTHING`)
      : pass('the live exit is dressed differently from its decoys',
        `LIVE ${liveKey} vs chained ${chainKeys.join(',')}`);
  }

  // =========================================================================
  // the rig: pick up the shipped hammer, park in front of a face, swing
  // =========================================================================
  const quiet = () => page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter;
    if (!h?.root) return false;
    let x = 0, z = 0;
    for (const s of e.room.spaces) { if (s.x1 > x) x = s.x1; if (s.z1 > z) z = s.z1; }
    h.root.position.set(x + 40, 0, z + 40); h.vel?.set?.(0, 0, 0);
    h.state = 'PATROL'; h.awareness = 0; h.root.visible = false;
    return true;
  });

  const grab = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField?.items?.find((i) => i.type === 'sledge');
    if (!it) return { found: false };
    p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
    p.interact(e.limbField, 1.5, null);
    return { found: true, owned: p.sledge.owned, equipped: p.sledge.equipped,
      power: +(p.digPower ?? 0).toFixed(3) };
  });
  note(`hammer: ${JSON.stringify(grab)}`);
  if (!grab.found || !grab.equipped) {
    fail('the driver is carrying the shipped sledgehammer, as John was', JSON.stringify(grab));
    return;
  }
  pass('the driver is carrying the shipped sledgehammer, as John was',
    `picked up the world prop; digPower ${grab.power} (so a blow is SLEDGE_POWER x ${grab.power})`);

  /**
   * @param {string} id     panel to stand in front of
   * @param {number} back   metres out along the normal
   * @param {number} [u]    where along the face to stand, 0..1 (0.5 = its centre)
   *
   * ⚠️ **`u` EXISTS BECAUSE A GENERATED FREE FACE'S CENTRE IS OFTEN A DOOR.** `_dressfix1-look`
   * records it: on a 27.20 m wall the free face's centre and the generated door's centre are the
   * same point, so a swing aimed at the middle of the dig band takes the connector instead and
   * the face reports nothing. Nothing depends on it for the exit sites, which ARE the connector.
   */
  const park = (id, back, u = 0.5) => page.evaluate(([pid, d, uu]) => {
    const e = window.__rrr.engine, p = e.room.panels.find((q) => q.id === pid);
    if (!p) return { ok: false };
    // Which side is the room side: the owning space's centre, or whichever probe lands in a space.
    const c = p.pointAt(uu, 0.5);
    const n = p.normal;
    let sign = 0;
    for (const s of [1, -1]) {
      const q = { x: c.x + n.x * s * 1.2, y: 0, z: c.z + n.z * s * 1.2 };
      if (e.room.spaceAt(q, 0)) { sign = s; break; }
    }
    if (!sign) sign = p.sideOf({ x: p.ownerSpace?.cx ?? 0, y: 0, z: p.ownerSpace?.cz ?? 0 }) || 1;
    e.player.pos.set(c.x + n.x * d * sign, e.room.floorY, c.z + n.z * d * sign);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-n.x * sign, -n.z * sign);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(yaw), z: Math.cos(yaw) } }]);
    return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null, sign,
      at: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)] };
    // ⚠️ **PASS `u` THROUGH. A DEFAULT ON THE OUTER ARROW DOES NOT REACH THE PAGE**, and this
    // exact slip cost a whole run: the array had two elements, `uu` arrived `undefined`,
    // `pointAt(undefined, 0.5)` returned NaN and the body was teleported to nowhere. The ledger
    // reported `parked in null` and sixteen honest `miss` rows rather than inventing a refusal —
    // which is the one thing that made it a five-minute diagnosis instead of a wrong finding.
  }, [id, back, u]);

  /**
   * One real swing. Returns what the game itself recorded, not what we hoped.
   *
   * ⚠️ **SPACED ON GAME TIME, NOT WALL TIME.** `WEAPON_COOLDOWN.sledge` is 0.95 s; run 1 clicked
   * as fast as the harness could and **5 of every 12 clicks were eaten by the cooldown** — an
   * honest row (they were reported as "never contacted anything") but a wasted third of the run.
   */
  const cooldown = async () => {
    const t0 = await page.evaluate(() => window.__rrr.engine.run.t);
    for (let i = 0; i < 80; i++) {
      await step(3);
      const t = await page.evaluate(() => window.__rrr.engine.run.t);
      if (t - t0 >= 1.05) return;
    }
  };
  const swing = async (id) => {
    const before = await page.evaluate((pid) => {
      const e = window.__rrr.engine, p = e.room.panels.find((q) => q.id === pid);
      window.__gx.chunks.length = 0;
      window.__gx.last = e.player._lastSledgeHit;
      return { stage: p.state.stage, hp: +p.state.stageHealth.toFixed(1),
        blocks: p.blocksMovement(), sight: p.blocksSight() };
    }, id);
    await cooldown();
    await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
    // wait for the CONTACT FRAME, not for wall time — the swing has a windup and the cooldown
    // is 0.95 s. A blow that never contacts times out and is recorded as one, honestly.
    let contacted = null;
    for (let i = 0; i < 60; i++) {
      await step(2);
      contacted = await page.evaluate((pid) => {
        const e = window.__rrr.engine, p = e.room.panels.find((q) => q.id === pid);
        const h = e.player._lastSledgeHit;
        if (!h || h === window.__gx.last) return null;
        window.__gx.last = h;
        const hud = e.gameHud?._msgState?.() ?? null;
        return {
          hadPanel: !!h.hadPanel, through: !!h.through,
          res: h.res ? { removed: +(h.res.removed ?? 0).toFixed(4), blocked: !!h.res.blocked,
            brokeThrough: !!h.res.brokeThrough, depthAt: +(h.res.depthAt ?? 0).toFixed(3),
            barrier: h.res.barrier } : null,
          chunks: window.__gx.chunks.slice(),
          stage: p.state.stage, hp: +p.state.stageHealth.toFixed(1),
          blocks: p.blocksMovement(), sight: p.blocksSight(),
          hudText: hud?.text ?? null, hudQueue: (hud?.queue ?? []).map((q) => q.text),
        };
      }, id);
      if (contacted) break;
    }
    return { before, contacted };
  };

  /**
   * A held, settled frame from the SAME station every time.
   *
   * 🚨 **RE-PARKING IS NOT TIDINESS — WITHOUT IT THIS COLUMN MEASURES THE CAMERA.** Run 1 of this
   * file did not re-park and reported **781 853 px>4 of a 1280x720 frame (85%) with a bounding box
   * of the whole screen** after ONE blow, on the live exit AND on both decoys alike. That is
   * `sledgeKick` + `player.shock` moving the third-person boom, not a wall changing: the one frame
   * that happened to catch the camera back near its start read **10 824 px>2** at the same station.
   * The pose is snapped back (`cam._first`) before every held frame so the only thing left in the
   * diff is the wall, the debris on the floor and the dust in the air.
   */
  let _station = null;
  const frame = async (tag) => {
    await quiet();
    await step(150);             // ~2.5 s of game time: the chips land and the dust fades
    if (_station) await park(_station.id, _station.back, _station.u ?? 0.5);
    await quiet(); await step(6);
    await hold(page); await step(4);
    const img = decodePng(await png(tag));
    await release(page); await step(2);
    return img;
  };
  const heldPair = async (tag) => {
    await quiet(); await step(60);
    if (_station) await park(_station.id, _station.back, _station.u ?? 0.5);
    await quiet(); await step(6);
    await hold(page); await step(4);
    const a = decodePng(await png(`${tag}-a`));
    await step(8);
    const b = decodePng(await png(`${tag}-b`));
    await release(page); await step(2);
    return { a, b };
  };

  // =========================================================================
  // G2 · THE PER-BLOW LEDGER, one site at a time
  // =========================================================================
  const targets = [
    { id: liveSite.id, label: 'LIVE' },
    ...chained.slice(0, 2).map((s, i) => ({ id: s.id, label: `chained${i + 1}` })),
  ];
  const ledger = [];
  let floor = null;

  for (const t of targets) {
    _station = { id: t.id, back: STANDOFF };
    const p = await park(t.id, STANDOFF);
    if (!p.ok) { note(`${t.id}: no such panel — skipped`); continue; }
    await quiet();
    await step(220);             // settle with the sim RUNNING, or the camera is left behind
    note(`--- ${t.label} ${t.id}: parked in ${p.space} at ${JSON.stringify(p.at)}, ${STANDOFF} m off the face`);

    // C1 — the same-config floor, at THIS station, once per site
    const pair = await heldPair(`genexit1-${TAG}${t.label}-floor`);
    const f = pxdiff(pair.a, pair.b);
    if (!floor) floor = f;
    note(`  floor at this station: px>${TH.join('/')} = ${f.n.join('/')} · mean|d| ${f.mean}`
      + ` · frame luma ${luma(pair.a)}`);

    const A = pair.a;                                      // the "before any blow" picture
    const rows = [];
    const shots = {};
    for (let k = 1; k <= BLOWS; k++) {
      const r = await swing(t.id);
      rows.push({ k, ...r });
      if (k === 1 || k === 3 || k === BLOWS) {
        shots[k] = await frame(`genexit1-${TAG}${t.label}-after${k}`);
      }
    }
    const first = rows[0];
    const last = rows[rows.length - 1];
    const landed = rows.filter((r) => r.contacted?.hadPanel).length;
    const onTarget = rows.filter((r) => (r.contacted?.chunks ?? []).some((c) => c.id === t.id)).length;
    const refused = rows.filter((r) => (r.contacted?.chunks ?? []).some((c) => c.id === t.id && c.blocked)).length;
    const misses = rows.filter((r) => !r.contacted).length;
    const stageMoves = rows.filter((r, i) => i > 0 && r.contacted && rows[i - 1].contacted
      && r.contacted.stage !== rows[i - 1].contacted.stage).length
      + ((first.contacted && first.contacted.stage !== first.before.stage) ? 1 : 0);

    note(`  blows: ${BLOWS} swung · ${landed} found a panel · ${onTarget} landed ON ${t.id}`
      + ` · ${refused} were REFUSED by it · ${misses} never contacted anything`);
    note(`  panel: stage ${first.before.stage} hp ${first.before.hp}`
      + ` -> stage ${last.contacted?.stage ?? '?'} hp ${last.contacted?.hp ?? '?'}`
      + ` · ${stageMoves} stage transition(s) in ${BLOWS} blows`);
    const perBlow = rows.map((r) => {
      const c = (r.contacted?.chunks ?? []).find((q) => q.id === t.id);
      return c ? `${c.removed}${c.blocked ? 'X' : ''}` : (r.contacted ? 'miss' : '-');
    });
    note(`  removed per blow on ${t.id}: ${perBlow.join(' ')}   (X = refused)`);
    // What `views/game.js`'s onChunk pays out is a pure function of these two numbers — a slab
    // above chunkSize 0.09, `round(removed*56)` crumbs (floored at 1), dust above removed 0.03.
    const sizes = [...new Set(rows.flatMap((r) => (r.contacted?.chunks ?? [])
      .filter((q) => q.id === t.id).map((q) => `removed ${q.removed} -> chunkSize ${q.chunkSize}`)))];
    note(`  the payout's own inputs: ${JSON.stringify(sizes)}`);
    const huds = [...new Set(rows.map((r) => r.contacted?.hudText).filter(Boolean))];
    const hudq = [...new Set(rows.flatMap((r) => r.contacted?.hudQueue ?? []))];
    note(`  HUD across the whole ${BLOWS}-blow session: slot ${JSON.stringify(huds)} · queue ${JSON.stringify(hudq)}`);
    const audio = [...new Set(rows.map((r) => r.contacted?.res
      ? `depth=${r.contacted.res.depthAt} barrier=${r.contacted.res.barrier} blocked=${r.contacted.res.blocked} broke=${r.contacted.res.brokeThrough}`
      : 'no res').filter(Boolean))];
    note(`  playMeleeImpact's own inputs (depth, barrier, blocked, brokeThrough): ${JSON.stringify(audio)}`);

    // ⛓️ D's A/B, taken HERE — parked in front of this door, with the room resident.
    //
    // 🚨 **THE FIRST CUT OF THIS TOOK IT AT THE END OF THE RUN AND READ 1-vs-1 ON BOTH ARMS.**
    // `dressedNow.chain` counts what is ON SCREEN, and `exterior.update()` gates every cue on
    // `p.root.visible`, i.e. on residency. Standing in the last room measured the last room's
    // chains and could never see the live exit's, two rooms away. The count was right and the
    // station was wrong, which is HANDOFF's "an offline reading taken inside the live game"
    // arriving from a third direction.
    //
    // 🚨 **A FRAME HAS TO RUN BETWEEN THE FLIP AND THE READ, AND LEAVING IT OUT COST A RUN.**
    // `census().dressedNow` reports `dress.shown[]`, which is written by `exterior.update()` —
    // so flipping the arm and reading in the SAME `page.evaluate` reads the state from before the
    // flip, twice. It came back 1-vs-1 with `chainDropped` correctly at 1, i.e. the rule was
    // working and the probe could not see it. This is HANDOFF's own rule arriving again: ask the
    // system's own state, and give the system a frame to produce it.
    const armChain = async (on) => {
      await page.evaluate((v) => window.__rrr.engine.exterior?.setChainDrop?.(v), on);
      await step(3);
      return page.evaluate(() => {
        const x = window.__rrr.engine.exterior;
        if (!x?.census) return null;
        const c = x.census();
        return { shown: c.dressedNow.chain, dropped: c.chainDropped, arm: c.chainDrop };
      });
    };
    const hasD = await page.evaluate(() => typeof window.__rrr.engine.exterior?.setChainDrop === 'function');
    const chainAB = hasD
      ? { on: await armChain(true), off: await armChain(false) }
      : { err: 'exterior.setChainDrop is missing — D is not in this build' };
    if (hasD) await armChain(true);   // leave it armed
    await step(3);

    const px = {};
    for (const k of Object.keys(shots)) px[k] = pxdiff(A, shots[k]);
    for (const k of Object.keys(px)) {
      note(`  SCREEN after ${k} blow(s) vs before: px>${TH.join('/')} = ${px[k].n.join('/')}`
        + ` · mean|d| ${px[k].mean} · box ${px[k].box}   (floor ${f.n.join('/')})`);
    }
    if (chainAB.err) note(`  chains: ${chainAB.err}`);
    else note(`  chains ON SCREEN here, rule ON ${chainAB.on.shown} · rule OFF ${chainAB.off.shown}`
      + ` · doors that have earned a drop ${chainAB.on.dropped}`);
    ledger.push({ t, rows, f, px, landed, onTarget, refused, misses, stageMoves, huds, hudq, audio, perBlow, chainAB });
  }

  // =========================================================================
  // C3 · THE CONTROL THAT MUST FAIL — the same ledger on an ordinary DIG FACE
  // =========================================================================
  //
  // ⚠️ **THE FACE HAS TO BE ONE THE BODY CAN STAND IN FRONT OF, AND RUN 1 PICKED ONE IT COULD
  // NOT.** It took the widest free face in the house (15.4 m, a corridor's) and parked against
  // the wrong side of it: **0 of 3 blows contacted anything**, so the control reported red for a
  // reason that was entirely the driver. Candidates are now tried in order until one takes a blow.
  const digFaces = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return e.room.panels.filter((p) => p.field && p.spec?.free && p.ownerSpace)
      .map((p) => ({ id: p.id, w: +p.width.toFixed(2), room: p.ownerSpace.id }))
      .sort((a, b) => b.w - a.w).slice(0, 6);
  });
  if (!digFaces.length) skip('the pixel probe can see a wall change when there is one', 'no free dig face in this house');
  else {
    let got = null;
    // ⚠️ TRY THE QUARTER POINTS BEFORE THE CENTRE — a generated free face's centre is usually a
    // generated door, so a swing aimed there takes the connector and the face reports nothing.
    const spots = [];
    for (const face of digFaces) for (const u of [0.25, 0.75, 0.5]) spots.push({ face, u });
    for (const { face, u } of spots) {
      _station = { id: face.id, back: STANDOFF, u };
      const p = await park(face.id, STANDOFF, u);
      if (!p.ok || !p.space) { note(`CONTROL ${face.id} @u=${u}: no station in a space — next candidate`); continue; }
      await quiet(); await step(220);
      const pair = await heldPair(`genexit1-${TAG}CONTROL-${face.id}-floor`);
      const rows = [];
      for (let k = 1; k <= 3; k++) rows.push(await swing(face.id));
      const onTarget = rows.filter((r) => (r.contacted?.chunks ?? []).some((c) => c.id === face.id)).length;
      if (!onTarget) { note(`CONTROL ${face.id} @u=${u} (${face.w} m in ${face.room}, parked in ${p.space}): 0/3 landed — next candidate`); continue; }
      const after = await frame(`genexit1-${TAG}CONTROL-${face.id}-after3`);
      got = { face, u, p, cf: pxdiff(pair.a, pair.b), d: pxdiff(pair.a, after), onTarget, rows };
      break;
    }
    if (!got) fail('the driver can land a hammer blow on an ordinary dig face',
      `no blow landed on any of ${digFaces.length} free faces — a generated free face's centre is `
      + 'often the same point as a generated door (see `_dressfix1-look`), so the ray takes the '
      + 'connector; the lateral offset above is meant to step off it');
    else {
      note(`CONTROL dig face ${got.face.id} (${got.face.w} m in ${got.face.room}, parked in ${got.p.space}):`
        + ` ${got.onTarget}/3 blows landed on it · removed ${got.rows.map((r) => r.contacted?.res?.removed ?? '-').join('/')}`
        + ` · floor px>${TH.join('/')} = ${got.cf.n.join('/')}`
        + ` · after 3 blows = ${got.d.n.join('/')} · mean|d| ${got.d.mean} · box ${got.d.box}`);
      // ⚠️ THE ASSERTION IS ON THE PANEL, NOT ON THE PIXELS — see the header. A positional face
      // reports a real m2-x-depth `removed` per blow; the exit's scalar arm reports a flat 0.14
      // fraction. That contrast is the finding, and it survives the lighting the pixels do not.
      const positional = got.rows.some((r) => (r.contacted?.res?.removed ?? 0) > 0
        && (r.contacted?.res?.removed ?? 0) !== 0.14);
      positional
        ? pass('the driver can land a hammer blow on an ordinary dig face',
          `${got.onTarget}/3 landed and paid out a POSITIONAL removal, not the scalar arm's flat 0.14`)
        : fail('the driver can land a hammer blow on an ordinary dig face',
          `${got.onTarget}/3 landed; removals ${got.rows.map((r) => r.contacted?.res?.removed).join('/')}`);
    }
  }

  // =========================================================================
  // G3 · THE RULING
  // =========================================================================
  const liveRow = ledger.find((l) => l.t.label === 'LIVE');
  const decoyRows = ledger.filter((l) => l.t.label !== 'LIVE');
  if (!liveRow || !decoyRows.length) { skip('the ruling', 'not enough sites were driven'); return; }

  // C2 — the driver works at all: the live exit's own numbers must move.
  const liveMoved = liveRow.rows.some((r) => (r.contacted?.chunks ?? [])
    .some((c) => c.id === liveRow.t.id && !c.blocked && c.removed > 0));
  liveMoved
    ? pass('the live exit really is damageable by the shipped hammer',
      `${liveRow.onTarget}/${BLOWS} blows landed on it, ${liveRow.refused} refused, `
      + `${liveRow.stageMoves} stage transition(s)`)
    : fail('the live exit really is damageable by the shipped hammer',
      `${liveRow.onTarget}/${BLOWS} landed, ${liveRow.refused} refused — nothing below can be believed`);

  // THE HEADLINE: on which blow does a player first have something to read?
  const readable = (l) => {
    const out = [];
    for (let i = 0; i < l.rows.length; i++) {
      const r = l.rows[i];
      const c = (r.contacted?.chunks ?? []).find((q) => q.id === l.t.id);
      const stageMoved = r.contacted && r.before && r.contacted.stage !== r.before.stage;
      out.push({ k: i + 1, debris: c ? !c.blocked : false, stageMoved: !!stageMoved,
        hud: !!r.contacted?.hudText });
    }
    return out;
  };
  const liveRead = readable(liveRow);
  const firstStage = liveRead.find((r) => r.stageMoved)?.k ?? null;
  const firstHud = liveRead.find((r) => r.hud)?.k ?? null;
  const decoyHud = decoyRows.some((l) => readable(l).some((r) => r.hud));

  note('=== THE RULING ===');
  note(`LIVE ${liveRow.t.id}: first blow that moved a STAGE (i.e. changed the wall's picture) = `
    + `${firstStage ?? `NEVER in ${BLOWS}`} · first blow that put a line on the HUD = ${firstHud ?? 'NEVER'}`);
  for (const l of decoyRows) {
    note(`decoy ${l.t.id}: ${l.refused}/${BLOWS} refused, ${l.stageMoves} stage changes, `
      + `HUD ${l.huds.length ? JSON.stringify(l.huds) : 'SILENT'}`
      + ` · screen after ${BLOWS} blows ${l.px[BLOWS]?.n.join('/') ?? '?'} px (floor ${l.f.n.join('/')})`);
  }
  const liveAfter1 = liveRow.px[1]?.n[1] ?? 0;
  const decoyAfter1 = Math.max(...decoyRows.map((l) => l.px[1]?.n[1] ?? 0));
  note(`ONE BLOW, on screen: live ${liveAfter1} px>4 · worst decoy ${decoyAfter1} px>4`
    + ` · floor ${liveRow.f.n[1]}/${decoyRows.map((l) => l.f.n[1]).join('/')}`);

  // =========================================================================
  // G4 · ⛓️ D — THE CHAIN COMES OFF THE DOOR THAT YIELDED, AND ONLY THAT ONE
  // =========================================================================
  //
  // 🚨 **THE ABLATION IS THE ASSERTION.** "The chain is gone" is unfalsifiable from a count alone
  // — a chain that was never drawn reads the same. So the arm is flipped IN PLACE, on the held
  // page, and the number that matters is how many chains come BACK. `update()` recomputes every
  // instance's `want` off `_chainDrop` every frame, so the next frame carries the other arm.
  const liveAB = liveRow.chainAB, decoyABs = decoyRows.map((l) => l.chainAB);
  if (!liveAB || liveAB.err) skip('the chain comes off a door that has yielded', liveAB?.err ?? 'no reading');
  else {
    const backLive = liveAB.off.shown - liveAB.on.shown;
    const backDecoy = decoyABs.map((q) => (q && !q.err ? q.off.shown - q.on.shown : 0));
    note(`chain A/B at each door — live +${backLive} when disarmed · decoys ${backDecoy.map((n) => `+${n}`).join(' ')}`);
    // ⛓️ the live exit yielded, so its chain must be gone and must come BACK when the rule is
    // disarmed; a decoy is `damageable:false`, cannot depart its start state however long you beat
    // on it, and must therefore be unaffected by the arm in either direction. Both halves, or this
    // says nothing: a rule that drops every chain would pass the first half on its own.
    if (backLive <= 0) {
      fail('the chain comes off a door that has yielded',
        `disarming the rule brought back ${backLive} chains at the live exit — it took `
        + `${liveRow.onTarget} landed blows and its padlock is still being drawn`);
    } else if (backDecoy.some((n) => n !== 0)) {
      fail('the chain comes off a door that has yielded',
        `a padlocked decoy's chain moved with the arm (${backDecoy.join(',')}) — a decoy can never `
        + 'take damage, so its chain must never depend on this rule');
    } else {
      pass('the chain comes off a door that has yielded',
        `at the live exit, disarming the rule brings back ${backLive} chain(s) — so it was dropped `
        + `after ${liveRow.onTarget} landed blows; at ${decoyRows.length} padlocked decoys the arm `
        + 'changes nothing, because nothing there ever yielded');
    }
  }

  const hudSeparates = !!firstHud || decoyHud;
  hudSeparates
    ? pass('the HUD tells a hammer player which door they just hit',
      `live first line at blow ${firstHud}; decoys ${decoyHud ? 'spoke' : 'silent'}`)
    : fail('the HUD tells a hammer player which door they just hit',
      `NOT ONE LINE in ${BLOWS} blows on the live exit or on ${decoyRows.length} decoys — `
      + 'the sledgehammer does not route through weapons.onWallHit');
}
