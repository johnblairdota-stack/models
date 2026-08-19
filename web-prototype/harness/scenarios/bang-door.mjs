/**
 * 🚪 **SOMETHING IS AT THE DOOR** — the hunter hears work it cannot walk to, comes to ONE chained
 * door of that room, and forces it.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/bang-door.mjs \
 *        --port 5411 --q "seed=s4&dig=1"
 *
 * ⚠️ **`--q`, NEVER `--extra`** (HANDOFF's hazard list: an unknown flag is silently ignored and
 * the checks then SKIP, which in a tail reads as "nearly a pass").
 *
 * John, 2026-08-10, answering his own question about how the hunter gets into a room the players
 * have not dug out of yet:
 *   *"the chained doors are a way the hunter can enter the room prior to the player opening the
 *   interconnect … the hunter is much stronger and bangs away at the doors to scare the players
 *   and eventually break its way in. If the players don't move out of the room this can be the
 *   timer."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 **WHAT THIS FILE IS ACTUALLY ABLE TO ASK, STATED FIRST.** HANDOFF: *"three instruments on
 * this project shipped green while blind — one asked 'can it open?' when it meant 'can it move?'"*
 * So, in order:
 *
 *   · It drives the NOISE BUS DIRECTLY (`engine.noise.emit`) rather than swinging a hammer for
 *     sixty seconds. That is deliberate and it is the *narrower* claim: it proves the hunter's
 *     half — hears, chooses, walks, works — and proves NOTHING about whether a real dig is loud
 *     enough to reach it from a given room. `dig-band.mjs` owns the clock; that question needs
 *     its own measurement and does not have one yet.
 *   · It asserts the door is **reached and hit**, not merely "chosen". A5 reads `hunter.state`
 *     AND the distance to the panel AND the blow count, because "it picked a door" is exactly the
 *     kind of assertion that passes on an AI standing still in another room.
 *   · The ESCALATION assertion reads `progress` off the panel's own remaining health, and checks
 *     it is STRICTLY INCREASING and ends at 1.0. A blow counter would satisfy "increasing" for
 *     free, so it also checks the first blow is under 0.4 — a counter normalised by an unknown
 *     total cannot know that.
 *
 * 🚨 **AND THE CONTROL RUNS ON EVERY RUN, TWICE.** A10 re-stages the identical summons with
 * `bangPolicy = 'off'` and REQUIRES it to fail to reach BANG; A2 requires `auto` to refuse a door
 * when an open doorway exists. If either of those ever goes green, this file is measuring nothing
 * and says so in its own output.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

const SUMMON = 2.6;      // loudness in gunshots — `HUNTER_SENSE.hearRange` 14 m x this = 36 m
const STEP_MS = 45;

export default async function bangDoor({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  /** Advance the live loop by `n` rendered frames, or bail. */
  const step = async (n = 12) => {
    const f0 = await frames();
    for (let i = 0; i < 400; i++) {
      await page.waitForTimeout(STEP_MS);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(350);

  // ---------------------------------------------------------------- 0. is the mechanic here
  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.hunter || !e?.room) return null;
    return {
      hasBus: !!e.noise,
      hasDoors: typeof e.room.chainedDoorsOf === 'function',
      policy: e.hunter.bangPolicy ?? null,
      route: (e.room.patrolRoute?.() ?? []).map((r) => ({ space: r.space, x: r.x, z: r.z })),
    };
  });
  if (!head?.hasBus || !head?.hasDoors) {
    skip('the door mechanic exists in this build',
      `noise bus ${head?.hasBus ? 'yes' : 'NO'}, room.chainedDoorsOf ${head?.hasDoors ? 'yes' : 'NO'} — wrong tree?`);
    return;
  }
  note(`shipped bang policy on this URL: ${head.policy}`);

  /** A point authored inside a named space — read off `PATROL_ROUTE`, never hardcoded. */
  const at = (space) => head.route.find((r) => r.space === space) ?? null;

  /**
   * Stage a summons and run it. Everything happens inside ONE page, and `bangPolicy` is a live
   * field, so every arm below is the same build, the same seed and the same bodies — the only
   * thing that differs is the one flag or the one position under test.
   */
  const stage = (o) => page.evaluate(({ hunterAt, noiseAt, policy, loud }) => {
    const e = window.__rrr.engine;
    const h = e.hunter, THREE_Y = e.room.floorY ?? 0;
    e.noise.clear();
    h.resetCombat();
    h.state = 'PATROL'; h.target = null; h.awareness = 0; h.searchTimer = 0;
    h.breachTarget = null; h.routeIdx = null; h.dwellLeft = null;
    h.vel.set(0, 0, 0);
    h.root.position.set(hunterAt.x, THREE_Y, hunterAt.z);
    h.bangPolicy = policy;
    window.__bang = { blows: [], door: null, doorSeen: 0 };
    h.onDoor = (d) => { window.__bang.door = { id: d.id, name: d.name, inside: d.inside, outside: d.outside }; window.__bang.doorSeen++; };
    h.onBang = (b) => window.__bang.blows.push({
      i: b.index, progress: +b.progress.toFixed(4), through: b.through, id: b.panel.id,
    });
    e.noise.emit({ x: noiseAt.x, y: 0.9, z: noiseAt.z }, loud, 'dig');
    return {
      here: e.room.spaceAt(h.root.position)?.id ?? null,
      there: e.room.spaceAt({ x: noiseAt.x, y: 0, z: noiseAt.z })?.id ?? null,
    };
  }, o);

  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter;
    const d = h.door;
    return {
      state: h.state,
      door: d ? d.id : null,
      doorName: d ? d.name : null,
      gap: d ? Math.hypot(d.panel.root.position.x - h.root.position.x,
        d.panel.root.position.z - h.root.position.z) : null,
      blocks: d ? d.panel.blocksMovement() : null,
      bang: window.__bang,
      noiseSeq: h._noiseSeq,
    };
  });

  /** Run until `want(r)` or `frames` run out. Returns the last read. */
  const until = async (want, budget = 60) => {
    let r = await read();
    for (let i = 0; i < budget && !want(r); i++) { if (await step(14) < 0) break; r = await read(); }
    return r;
  };

  // ---------------------------------------------------------------- 1. the bus
  const busOk = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.noise.clear();
    const near = e.noise.emit({ x: 1, y: 1, z: 2 }, 1.4, 'dig');
    const tiny = e.noise.emit({ x: 3, y: 1, z: 4 }, 0.01, 'dig');   // under the floor
    const loudest = e.noise.loudest();
    const door = e.noise.emit({ x: 9, y: 1, z: 9 }, 9.0, 'door');   // the hunter's own hammer
    const deafened = e.noise.loudest({ ignoreKind: 'door' });
    const hears = e.noise.loudest();
    e.noise.clear();
    return {
      accepted: !!near, refusedTiny: tiny === null,
      loudestIsNear: loudest?.seq === near?.seq,
      pos: loudest ? [loudest.x, loudest.z] : null,
      doorEmitted: !!door,
      deafenedSkipsDoor: deafened?.seq === near?.seq,
      undeafenedSeesDoor: hears?.seq === door?.seq,
      cleared: e.noise.recent().length,
    };
  });
  if (busOk.accepted && busOk.refusedTiny && busOk.loudestIsNear
    && busOk.pos[0] === 1 && busOk.pos[1] === 2 && busOk.cleared === 0) {
    pass('A1 a noise event has a position and a loudness, and the loudest recent one comes back',
      `emitted at (1, 2) and read back at (${busOk.pos.join(', ')}); a 0.01 emit was refused under the floor`);
  } else {
    fail('A1 a noise event has a position and a loudness, and the loudest recent one comes back',
      JSON.stringify(busOk));
  }

  // 🚨 THE CONTROL FOR A1's SIBLING CLAIM. The `door` kind must be invisible to the filtered read
  // and VISIBLE to the unfiltered one — if the second half were not true the first would pass on a
  // bus that had simply dropped the event, which is a different bug wearing the same green tick.
  if (busOk.doorEmitted && busOk.deafenedSkipsDoor && busOk.undeafenedSeesDoor) {
    pass('A11 the hunter can be made deaf to its own hammer, and the filter is the only reason',
      'a 9.0 `door` emit is skipped by `loudest({ignoreKind:"door"})` and returned by `loudest()` — both arms, same event');
  } else {
    fail('A11 the hunter can be made deaf to its own hammer, and the filter is the only reason',
      `emitted ${busOk.doorEmitted}, filtered-out ${busOk.deafenedSkipsDoor}, unfiltered-sees ${busOk.undeafenedSeesDoor}`);
  }

  const gal = at('gallery'), sw = at('study_w'), chapel = at('chapel');
  if (!gal || !sw || !chapel) { skip('the rest of the file', 'PATROL_ROUTE does not name gallery/study_w/chapel'); return; }

  // ---------------------------------------------------------------- 2. `auto` refuses an open room
  //
  // 🚨 THIS IS A CONTROL THAT MUST FAIL TO BE INTERESTING, AND IT RUNS EVERY RUN. `study_w` has
  // D1 open to the gallery. An AI that hammers a door with an open doorway six metres away is the
  // "forgot what it was doing" failure `hunter-ai.js` names as its most expensive class. If this
  // ever reports a door, the shipped rule has become "always" and nobody noticed.
  let s = await stage({ hunterAt: gal, noiseAt: sw, policy: 'auto', loud: SUMMON });
  note(`staged: hunter in ${s.here}, noise in ${s.there}`);
  let r = await until((x) => x.door !== null, 12);
  if (r.door === null && r.state !== 'BANG' && r.state !== 'HUNT') {
    pass('A2 CONTROL — `auto` does NOT force a door into a room it can simply walk into',
      `hunter in ${s.here}, dig heard in ${s.there} (D1 is open between them): state ${r.state}, door none`);
  } else {
    fail('A2 CONTROL — `auto` does NOT force a door into a room it can simply walk into',
      `it chose ${r.door} anyway (state ${r.state}) — the open-route check is not firing`);
  }

  // ---------------------------------------------------------------- 3. `auto` is not dead
  //
  // The chapel is the one room in today's house whose only way in is a shut door: D7 was removed
  // on 2026-08-08 and `p.chapel` (BREACHABLE) is all that is left. So the shipped rule DOES fire
  // somewhere, on merit, with no flag — which is the difference between a mechanic and a demo.
  s = await stage({ hunterAt: gal, noiseAt: chapel, policy: 'auto', loud: SUMMON });
  r = await until((x) => x.door !== null, 12);
  if (r.door) {
    pass('A3 `auto` DOES force a door when there is no open route — the chapel, on merit',
      `hunter in ${s.here}, dig heard in ${s.there}: chose ${r.door} (${r.doorName})`);
  } else {
    fail('A3 `auto` DOES force a door when there is no open route — the chapel, on merit',
      `no door chosen (state ${r.state}) — with A2 green that means the mechanic never fires at all`);
  }

  // ---------------------------------------------------------------- 4. the door, named and single
  s = await stage({ hunterAt: gal, noiseAt: sw, policy: 'always', loud: SUMMON });
  r = await until((x) => x.door !== null, 12);
  const chosen = r.door;
  if (chosen && r.bang.doorSeen === 1 && r.doorName && /\S/.test(r.doorName)) {
    pass('A4 it chooses exactly ONE chained door of the room the noise came from, and it has a name',
      `${chosen} — "${r.doorName}" — announced once (onDoor fired ${r.bang.doorSeen}x)`);
  } else {
    fail('A4 it chooses exactly ONE chained door of the room the noise came from, and it has a name',
      `door ${chosen}, onDoor fired ${r.bang?.doorSeen}x, name ${JSON.stringify(r.doorName)}`);
  }

  // ---------------------------------------------------------------- 5. it cannot reach an exit site
  //
  // 🚨 **THE GATE THAT PROTECTS `escape.mjs` 20/20.** The connectors whose STATE is literally
  // CHAINED are the thirteen decoy exit sites; forcing one would be a second way out of the house
  // and would break the win condition. The claim is not "we did not pick one" — it is that they
  // are not on offer AT ALL — so this asserts a POSITIVE subject (the room has some) and a
  // NEGATIVE result (none of them is in the list). An empty room would make this vacuous, and the
  // first half is what stops that.
  const exitGuard = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room;
    const out = {};
    for (const sp of ['study_w', 'gallery', 'chapel', 'ballroom', 'study_e', 'service']) {
      const offered = room.chainedDoorsOf(sp).map((d) => d.id);
      const sites = room.connectors
        .filter((c) => (c.a === sp || c.b === sp) && (c.b === 'outside' || c.a === 'outside'))
        .map((c) => c.id);
      out[sp] = { offered, sites, leak: offered.filter((id) => sites.includes(id)) };
    }
    return out;
  });
  const withSites = Object.entries(exitGuard).filter(([, v]) => v.sites.length > 0);
  const leaks = Object.entries(exitGuard).filter(([, v]) => v.leak.length > 0);
  if (withSites.length >= 4 && leaks.length === 0) {
    pass('A5 no EXIT SITE is ever offered as a door — the escape mechanic cannot be reached from here',
      `${withSites.length} spaces carry exit sites (${withSites.map(([k, v]) => `${k}:${v.sites.length}`).join(' ')}) and NONE appears in chainedDoorsOf`);
  } else {
    fail('A5 no EXIT SITE is ever offered as a door — the escape mechanic cannot be reached from here',
      withSites.length < 4 ? `only ${withSites.length} spaces carry exit sites — the subject is too thin to prove anything`
        : `LEAK: ${leaks.map(([k, v]) => `${k} -> ${v.leak.join(',')}`).join('; ')}`);
  }

  // ---------------------------------------------------------------- 6. it arrives and it works
  //
  // ⚠️ **THE BUDGET HERE IS THE MEASUREMENT, NOT A TIMEOUT TO TUNE UNTIL GREEN.** `PATROL_ROUTE`'s
  // first `gallery` stop is the EAST end (x +11.0) and `p.gal_w` is at x −12.0, so this arm makes
  // the hunter walk the full 23 m of the long gallery to get to the door it chose. The first run
  // of this file budgeted 9 s and reported FAIL at 9.33 m with the hunter still in HUNT and still
  // closing — a correct measurement of an impatient probe. `gap0` is recorded so the pass says how
  // far it actually came, which is the claim: it NAVIGATES to a place, it does not teleport.
  const gap0 = r.gap;
  r = await until((x) => x.state === 'BANG' || x.bang.blows.length > 0, 140);
  if (r.state === 'BANG' && r.gap != null && r.gap < 3.2) {
    pass('A6 it WALKS the house to the door it chose and stops at it',
      `${gap0.toFixed(2)} m away when it chose ${r.door}, ${r.gap.toFixed(2)} m when it started work — state BANG`);
  } else {
    fail('A6 it WALKS the house to the door it chose and stops at it',
      `state ${r.state}, gap ${r.gap == null ? 'n/a' : r.gap.toFixed(2)} m (was ${gap0?.toFixed(2)} m at choice)`);
  }

  // 📷 **THE FRAME JOHN ASKED FOR** — and it is deliberately taken from the SEALED side. The
  // mechanic's whole proposition is that you are in the room, you cannot see the thing, and one
  // door starts moving. `_bang`'s dust and plaster come off the panel centre so they bloom on
  // this face too, which is the in-world half of "which door".
  await page.evaluate(({ id }) => {
    const e = window.__rrr.engine, room = e.room, p = room.panelOf(id);
    const c = room.connector(id), n = p.normal;
    const sealed = e.room.spaceAt({ x: c.x + n.x * 1.2, y: 0, z: c.z + n.z * 1.2 }) ? 1 : -1;
    const yaw = Math.atan2(-n.x * sealed, -n.z * sealed);
    e.player.pos.set(c.x + n.x * sealed * 3.0, room.floorY, c.z + n.z * sealed * 3.0);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0.03; e.cam._first = true;
  }, { id: chosen });
  await step(10);
  await shot?.(`bang-at-the-door-${chosen.replace(/\./g, '-')}`,
    `The hunter working on ${chosen} from the far side, seen from inside the room it is coming into.`);

  // ---------------------------------------------------------------- 7. the escalation, and it is real
  r = await until((x) => x.bang.blows.some((b) => b.through), 90);
  const blows = r.bang.blows;
  const prog = blows.map((b) => b.progress);
  const rising = prog.every((v, i) => i === 0 || v > prog[i - 1]);
  const oneDoor = new Set(blows.map((b) => b.id)).size === 1;
  note(`blows on ${chosen}: ${prog.map((p) => p.toFixed(3)).join(' -> ')}`);
  if (blows.length >= 4 && rising && prog[0] < 0.4 && prog[prog.length - 1] === 1 && oneDoor) {
    pass('A7 the banging ESCALATES, and the escalation is the door\'s own remaining material',
      `${blows.length} blows on ONE panel, progress ${prog[0].toFixed(3)} -> 1.000, strictly increasing. `
      + 'A blow counter could satisfy "increasing" for free; it could not know the first blow is under 0.4.');
  } else {
    fail('A7 the banging ESCALATES, and the escalation is the door\'s own remaining material',
      `${blows.length} blows, rising ${rising}, first ${prog[0]}, last ${prog[prog.length - 1]}, one panel ${oneDoor}`);
  }

  // ---------------------------------------------------------------- 8. it gets in
  const through = await page.evaluate(({ id }) => {
    const room = window.__rrr.engine.room;
    const p = room.panelOf(id);
    const c = room.connector(id);
    const routed = room.pathPortals(c.a, c.b).some((e) => e.id === id || e.a === c.a || e.a === c.b);
    return { blocks: p.blocksMovement(), open: !p.blocksMovement(), routed, a: c.a, b: c.b };
  }, { id: chosen });
  if (through.open && through.routed) {
    pass('A8 it breaks its way IN, and the hole is a route the graph agrees with',
      `${chosen} no longer blocks movement and ${through.a} <-> ${through.b} is routable`);
  } else {
    fail('A8 it breaks its way IN, and the hole is a route the graph agrees with',
      `blocksMovement ${through.blocks}, routed ${through.routed}`);
  }

  // ---------------------------------------------------------------- 9. THE REINTRODUCTION ARM
  //
  // 🚨 Everything above ran with the mechanic ON. HANDOFF: *"a gate which has only ever seen
  // working code is not evidence."* So the identical summons is re-staged with `bangPolicy` off —
  // same page, same bodies, same noise, one flag — and it MUST NOT reach a door. If this line ever
  // passes, every green above it is worthless and this file has just said so.
  await page.evaluate(() => window.__rrr.engine.room.panelOf(window.__bang.blows[0]?.id)?.state?.reset?.());
  s = await stage({ hunterAt: gal, noiseAt: sw, policy: 'off', loud: SUMMON });
  const off = await until((x) => x.door !== null || x.state === 'BANG', 16);
  if (off.door === null && off.state !== 'BANG' && off.bang.blows.length === 0) {
    pass('A9 CONTROL — with `?bang=off` the identical summons produces no door and no blow',
      `state ${off.state}, door none, 0 blows — so A4/A6/A7/A8 are measuring the mechanic and not the staging`);
  } else {
    fail('A9 CONTROL — with `?bang=off` the identical summons produces no door and no blow',
      `door ${off.door}, state ${off.state}, ${off.bang.blows.length} blows — THE ABLATION DOES NOT ABLATE`);
  }

  // ---------------------------------------------------------------- 10. it does not summon itself
  //
  // 🚨 **THIS CHECK PASSED FOR THE WRONG REASON ON ITS FIRST RUN AND THAT IS WHY THE GUARD BELOW
  // EXISTS.** The arms above leave the player parked 3 m from the door, so staging the hunter in
  // the same room put it on top of the player: it attacked, took an arm and entered GROW — and
  // `hearNoise` REFUSES outright during GROW/PURSUE/ATTACK. So "no door was chosen" was true and
  // said nothing about the same-room rule, which is HANDOFF's *"a probe that cannot observe must
  // report SKIP, never PASS"* arriving as a green tick. The player is now moved out of reach
  // first, and the check FAILS unless the hunter is in a state that can actually hear.
  await page.evaluate(({ x, z }) => {
    const e = window.__rrr.engine;
    e.player.pos.set(x, e.room.floorY, z);
    e.hunter.resetCombat(); e.hunter.absorbed = 2; e.hunter.awareness = 0;
  }, { x: gal.x, z: gal.z });
  await step(8);
  s = await stage({ hunterAt: sw, noiseAt: sw, policy: 'always', loud: SUMMON });
  const same = await until((x) => x.door !== null, 10);
  const CAN_HEAR = ['PATROL', 'ALERT', 'STALK', 'SEARCH', 'HUNT', 'BANG'];
  if (!CAN_HEAR.includes(same.state)) {
    fail('A10 a noise in the room it is ALREADY IN never sends it to a door',
      `the hunter is in ${same.state}, which \`hearNoise\` refuses outright — this check could not observe the rule`);
  } else if (same.door === null) {
    pass('A10 a noise in the room it is ALREADY IN never sends it to a door',
      `hunter and noise both in ${s.here}, hunter in ${same.state} (a state that CAN hear): no door — `
      + 'it falls through to the pre-existing ALERT/SEARCH ladder, unchanged');
  } else {
    fail('A10 a noise in the room it is ALREADY IN never sends it to a door',
      `it walked out to ${same.door} to come back in through it`);
  }

  // ---------------------------------------------------------------- 11. 👁️ CAN YOU PEEK?
  //
  // John: *"the chained doors are HINGED and the player can even peek outside through them, but
  // the chains stop them from opening far enough to escape."* He chose no verb and no special
  // camera for it — *"just walk up to it"*.
  //
  // 🚨 **THE RISK THE BRIEF NAMED IS THE THIRD-PERSON BOOM, AND THAT IS NOT WHERE THIS FAILS.**
  // Before any camera question there is a geometry question, and it is decidable without a
  // picture: a closed connector is ONE SOLID SLAB. `STAGE_DEFS[0]` is `blocksSight: true` and
  // `solidBoxes()` returns the whole panel box, so there is no gap in the world for an eye to get
  // to. The chain and boards `exterior.js` hangs on it are DRESSING on the face of that slab.
  // Sight only opens at stage 3 (`beam`, `blocksSight: false`) — 165 hp in, i.e. after the hunter
  // has already done two thirds of the job.
  //
  // So this reports the state of the world rather than judging a camera, and the shot is the
  // picture that goes with the statement. Both arms are asserted: a closed door must block and an
  // opened one must not, so a "cannot peek" result cannot be a broken sight test.
  // ⚠️ A FULL ROUND RESET FIRST. By now the player has lost an arm to the A10 staging and the
  // screen carries the wound wash — a frame that is meant to answer *"what do you see when you
  // walk up to a closed door"* must not also be a picture of a dismembered robot under a red
  // filter. `resetRound` is the production one (`views/game.js`), exposed for `mansion.mjs` A5.
  await page.evaluate(() => window.__rrr.engine.resetRound?.());
  await step(10);
  const peek = await page.evaluate(({ id }) => {
    const e = window.__rrr.engine, room = e.room, p = room.panelOf(id);
    p.state.reset();
    const c = room.connector(id);
    const n = p.normal;
    const inSide = room.spaceAt({ x: c.x + n.x * 1.2, y: 0, z: c.z + n.z * 1.2 })?.id ?? null;
    const eye = { x: c.x + n.x * 1.05, y: 1.35, z: c.z + n.z * 1.05 };
    const far = { x: c.x - n.x * 2.2, y: 1.35, z: c.z - n.z * 2.2 };
    const closedBlocksSight = p.state.blocksLineOfSight();
    const closedRoomBlocks = room.blocksSight(eye, far);
    const boxes = p.solidBoxes().length;
    // ...and the other arm, so "it blocks" is not just a sight test that always says yes.
    p.state.setStage(4);
    const openBlocksSight = p.state.blocksLineOfSight();
    const openRoomBlocks = room.blocksSight(eye, far);
    p.state.reset();
    // park the player nose-to-the-door for the picture
    const yaw = Math.atan2(-n.x, -n.z);
    e.player.pos.set(c.x + n.x * 1.15, room.floorY, c.z + n.z * 1.15);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0.02; e.cam._first = true;
    e.hunter.bangPolicy = 'off'; e.hunter.state = 'PATROL'; e.noise.clear();
    return { id, inSide, closedBlocksSight, closedRoomBlocks, openBlocksSight, openRoomBlocks, boxes };
  }, { id: chosen });
  await step(24);
  await shot?.(`bang-peek-${peek.id.replace(/\./g, '-')}-closed`,
    `Standing 1.15 m from ${peek.id} on the ${peek.inSide} side, closed. This is the "just walk up to it" frame.`);

  if (peek.closedBlocksSight && peek.closedRoomBlocks && !peek.openBlocksSight && !peek.openRoomBlocks) {
    fail('A11 you can peek through a closed chained door — YOU CANNOT, AND IT IS GEOMETRY, NOT THE CAMERA',
      `${peek.id} closed: blocksLineOfSight true, room.blocksSight true, ${peek.boxes} solid box(es) — `
      + 'the same tests on the SAME panel driven to `open` both read false, so the sight test works and the '
      + 'answer is that a closed connector is one solid slab with no aperture in it. John\'s hinged leaf and '
      + 'its gap are UNBUILT geometry (`room.js` `buildWall` / `exterior.js` dressing), not a boom problem. '
      + 'Kept RED on its own named line so it stays visible.');
  } else if (!peek.closedBlocksSight || !peek.closedRoomBlocks) {
    pass('A11 you can peek through a closed chained door',
      `${peek.id} closed lets sight through — blocksLineOfSight ${peek.closedBlocksSight}, room.blocksSight ${peek.closedRoomBlocks}`);
  } else {
    fail('A11 you can peek through a closed chained door — AND THE SIGHT TEST IS BROKEN',
      `an OPENED ${peek.id} still blocks sight (${peek.openBlocksSight}/${peek.openRoomBlocks}) — this probe cannot answer the question`);
  }
}
