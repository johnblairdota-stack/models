/**
 * EXTERIOR-LOOK — is there anything out there, is the tell readable, and what does it cost?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/exterior-look.mjs \
 *        --port 5194 --shots --q "seed=rrr-test-1"
 *   ...and again with --q "seed=rrr-test-1&exterior=0" for the whole-module ablation.
 *
 * ⚠️ WHY THIS EXISTS RATHER THAN ANOTHER `shot()` IN `escape.mjs`. That scenario teleports the
 * player and photographs after `step(12)`. The boom is a LERP — `k = 1 - exp(-11*dt)`, so
 * twelve 60 Hz frames close 88.8% of the gap — and it interpolates its POSITION through
 * whatever is in the way (only the boom LENGTH is raycast). Teleport the player 25 m across
 * the house and the shutter opens with the lens inside a wall: measured here, and on seed
 * `rrr-test-1` BOTH arms of the ablation photographed a full-frame close-up of plaster.
 * `esc1b-the-way-out` is therefore not evidence about the way out unless the live site happens
 * to be near where the player already was. Every station below SETTLES the boom to a standstill
 * before it shoots, and reports the residual drift so a station that did not settle says so.
 *
 * Three questions, in the brief's order:
 *   1. does an opened exit show daylight   -> `ext-way-out*`, plus a same-frame A/B and a picker
 *   2. is the concealment tell readable    -> `ext-tell-*`, live vs chained
 *   3. what does the outside cost          -> a deterministic draw-call and mesh census
 */

export default async function exteriorLook({ page, note, pass, fail, skip, shot }) {
  const step = async (n = 3) => {
    const f0 = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(50);
      const f = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  /** Step until the boom stops moving. Returns frames spent and final per-frame travel. */
  const settle = async (limit = 300) => {
    let last = null, still = 0, spent = 0, d = 99;
    for (let i = 0; i < limit / 5; i++) {
      await step(5); spent += 5;
      const p = await page.evaluate(() => {
        const c = window.__rrr.engine.camera.position;
        return [c.x, c.y, c.z];
      });
      if (last) d = Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) / 5;
      last = p;
      if (d < 0.0015) { still++; if (still >= 2) break; } else still = 0;
    }
    return { frames: spent, drift: +d.toFixed(5), at: last };
  };

  /**
   * Take the win screen off the glass. Stepping into the yard IS an escape, so every outdoor
   * station below would otherwise photograph a blurred backdrop behind `#rrr-escape` — a
   * picture of the overlay, which is the mistake this project spent thirty rounds making with
   * the capture-mode scrim. The WORLD is untouched; only the DOM node goes.
   */
  const bare = () => page.evaluate(() => {
    for (const s of ['#rrr-escape', '#rrr-death']) document.querySelector(s)?.remove();
  });

  const ready = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    return !!(e?.run && e.exits && e.room && e.exterior);
  });
  if (!ready) { fail('game.play exposes the run and the exterior', 'engine.run / exits / exterior missing'); return; }

  const on = await page.evaluate(() => !!window.__rrr.engine.exterior.enabled);
  const plan = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { seed: String(e.run.seed), exitId: e.run.exitId, lock: e.run.lock.id,
      start: e.run.lock.startStage, census: e.exterior.census() };
  });
  note(`exterior ${on ? 'ON' : 'ABLATED (?exterior=0)'} - seed "${plan.seed}" -> ${plan.exitId} - lock "${plan.lock}"`);
  if (plan.census.enabled) {
    note(`yards built: ${plan.census.yards.map((y) => `${y.id}${y.live ? '*' : ''}=${(y.tris / 1000).toFixed(1)}k tris`).join(' - ')}`);
  }

  /** Stand square in front of a site, `back` metres inside the room, and snap the boom. */
  const stand = (id, back) => page.evaluate(({ id, back }) => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => q.site.id === id);
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    e.player.pos.set(p.x + n.x * inS * back, e.room.floorY, p.z + n.z * inS * back);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-n.x * inS, -n.z * inS);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0;
    e.cam._first = true;      // kill the boom's history: a settle, not a 25 m flight
    return true;
  }, { id, back });

  /** Draw calls and the visible-mesh census, off a real rendered frame. Deterministic. */
  const census = () => page.evaluate(() => {
    const e = window.__rrr.engine, r = e.renderer.info.render;
    let extMesh = 0, extTris = 0, allMesh = 0, allTris = 0, dressMesh = 0;
    e.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints) || !o.visible) return;
      let p = o, vis = true, ext = false;
      while (p) { if (!p.visible) vis = false; if (p.name === 'exterior') ext = true; p = p.parent; }
      if (!vis) return;
      const t = o.geometry?.index ? o.geometry.index.count / 3
        : (o.geometry?.attributes?.position?.count ?? 0) / 3;
      allMesh++; allTris += t;
      // ⚠️ THE CONNECTOR DRESSING IS NOT "THE OUTSIDE" AND MUST NOT BE COUNTED AS IT. It hangs
      // off the same root, but it is the chain and boards nailed to walls INSIDE the house, on
      // every connector, so it is resident wherever the player is by design — four
      // `InstancedMesh`es, four draw calls, flat, seed-independent (`exterior.js`). Counting it
      // as a yard turns the residency assertion below into a permanent false failure.
      if (/^exterior\.dress\./.test(o.name)) { dressMesh++; return; }
      if (ext) { extMesh++; extTris += t; }
    });
    return { calls: r.calls, tris: r.triangles, allMesh, allTris: Math.round(allTris),
      extMesh, extTris: Math.round(extTris), dressMesh,
      spaces: e.room.visibleSpaces(), yard: e.exterior.census() };
  });

  // =========================================================================
  // 1 - THE WAY OUT
  // =========================================================================
  const openIt = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    const V = p.constructor;
    let shots = 0;
    for (let i = 0; i < 300 && x.panel.state.stage < 4; i++) {
      e.weapons.fire('nailgun', new V(p.x + n.x * inS * 2.0, 1.35, p.z + n.z * inS * 2.0),
        new V(-n.x * inS, 0, -n.z * inS), performance.now() / 1000, { ignore: e.player.rig });
      shots++;
    }
    return { id: x.site.id, shots, stage: x.panel.state.stage };
  });
  note(`opened ${openIt.id} with ${openIt.shots} rounds -> stage ${openIt.stage}`);

  // Let the breach burst clear. `onBreak` throws debris chips and two dust bursts at the panel,
  // and a picture taken while they hang in the aperture is a picture of the DUST — the same
  // class of error as photographing an effect that has not fired yet. `DustSystem`'s life is
  // `3.2 s * (0.55..1.55)`, so ~5 s is the floor: 120 frames was not enough, and the first A/B
  // pair taken here differed by a dust puff sitting in the hole on one arm only.
  for (let i = 0; i < 8; i++) await step(45);

  await stand(openIt.id, 4.2);
  const s1 = await settle();
  note(`way-out station: settled in ${s1.frames} frames, residual drift ${s1.drift} m/frame`);
  const c1 = await census();
  await shot('ext-way-out');

  // ...and from where a player actually stands having just chewed through a wall: close enough
  // that the hole is the frame rather than a postage stamp on the far side of it.
  await stand(openIt.id, 2.2);
  await settle();
  await shot('ext-way-out-near');

  // ⚠️ THE PLAYER'S OWN BODY IS IN FRONT OF THE HOLE at every station square on an exit: the
  // boom sits 3.1 m back with a 0.44 m shoulder offset, so the robot fills the middle of the
  // aperture and the lens sees the rest of it OBLIQUELY — mostly the 0.30 m jamb. Three A/B
  // readings taken through that gap differed by ~1 luma level and nearly became "the yard does
  // not render"; they were measuring the reveal on both arms. The body is a real composition
  // problem and is reported as one, but it must not masquerade as the exterior failing.
  //
  // A SAME-FRAME ABLATION, not a second process. `?exterior=0` reboots the page, so its arm has
  // different dust, a different debris scatter and a different clock.
  for (const [tag, ext] of [['EXTERIOR', true], ['ABLATED', false]]) {
    await page.evaluate(({ ext }) => {
      const e = window.__rrr.engine;
      e.player.root.visible = false;
      e.exterior.setVisible(ext);
    }, { ext });
    await step(2);
    await shot(`ext-through-the-hole-${tag}`);
  }
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.player.root.visible = true;
    e.exterior.setVisible(true);
  });
  await step(2);

  // ⚠️ WHO OWNS THE CENTRE OF THE APERTURE. Hide every visible mesh in the scene ONE AT A TIME,
  // re-render, and read the same pre-tonemap pixel back out of `pipeline.sceneRT` —
  // `_tmp_fxglow.mjs`'s readback used as a picker. Written because `three` is a bare specifier
  // the page cannot import, so no Raycaster is reachable from a scenario, and because three
  // rounds of reasoning about which surface this was were all wrong. It is what found the
  // mortar patch.
  const occ = await page.evaluate(() => {
    const e = window.__rrr.engine, r = e.renderer, rt = e.pipeline.sceneRT;
    const W = rt.width, H = rt.height;
    const px = Math.round(W * 0.5), py = Math.round(H * 0.5);
    // ⚠️ THE BUFFER TYPE MUST MATCH THE TARGET OR THE READ SILENTLY RETURNS ZEROS. A
    // Float32Array against a HalfFloat target is a GL error, not an exception — the first
    // version of this probe reported `[0,0,0]` at the aperture AND "no mesh changes it", which
    // reads exactly like "nothing is drawn there" and was in fact "nothing was read".
    const TYPE = rt.texture.type;
    const mk = () => (TYPE === 1015 ? new Float32Array(4)
      : TYPE === 1016 ? new Uint16Array(4) : new Uint8Array(4));
    const h2f = (h) => {
      const s = (h & 0x8000) ? -1 : 1, ex = (h >> 10) & 0x1f, m = h & 0x3ff;
      if (ex === 0) return s * m * 2 ** -24;
      if (ex === 31) return s * Infinity;
      return s * (m + 1024) * 2 ** (ex - 25);
    };
    const dec = (b) => (TYPE === 1016 ? [h2f(b[0]), h2f(b[1]), h2f(b[2])]
      : TYPE === 1015 ? [b[0], b[1], b[2]] : [b[0] / 255, b[1] / 255, b[2] / 255]);
    const buf = mk();
    const sampleAt = (x, y) => {
      e.pipeline.render(0);
      r.readRenderTargetPixels(rt, x, H - 1 - y, 1, 1, buf);
      return dec(buf);
    };
    const sample = () => sampleAt(px, py);
    // VALIDATE THE INSTRUMENT BEFORE TRUSTING IT: a control pixel three-quarters across the
    // frame sits on the lit interior wall and MUST read non-zero.
    const control = sampleAt(Math.round(W * 0.78), Math.round(H * 0.3));
    const base = sample();
    const mag = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const meshes = [];
    e.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints) || !o.visible) return;
      let p = o; while (p) { if (!p.visible) return; p = p.parent; }
      meshes.push(o);
    });
    const found = [];
    for (const m of meshes) {
      m.visible = false;
      const s = sample();
      m.visible = true;
      if (mag(s, base) > 0.004) {
        let path = [], p = m;
        while (p && path.length < 5) { path.unshift(p.name || '?'); p = p.parent; }
        found.push({ path: path.join('/'), mat: m.material?.name ?? '(unnamed mat)',
          delta: +mag(s, base).toFixed(4), to: s.map((v) => +v.toFixed(4)) });
      }
    }
    return { base: base.map((v) => +v.toFixed(4)), control: control.map((v) => +v.toFixed(4)),
      type: TYPE, meshes: meshes.length, found, px, py, W, H };
  });
  note(`readback control (lit interior wall) = ${JSON.stringify(occ.control)} - rt type ${occ.type}`);
  note(`aperture centre px(${occ.px},${occ.py}) of ${occ.W}x${occ.H} reads HDR ${JSON.stringify(occ.base)} over ${occ.meshes} visible meshes`);
  note(`hiding these changes it: ${occ.found.length ? occ.found.map((f) => `${f.path} [${f.mat}] d=${f.delta} -> ${JSON.stringify(f.to)}`).join(' || ') : 'nothing'}`);
  if (occ.control.every((v) => v === 0)) {
    fail('the aperture picker can observe anything at all',
      'the control pixel on a lit wall read zero — the readback is broken, ignore its verdict');
  } else if (!on) {
    skip('nothing of this module is left standing in its own opening', 'ablated arm');
  } else {
    // A dressing that outlives the wall it is nailed to is THE defect this round found.
    const mine = occ.found.filter((f) => /exterior\.(lock|chained|seam)/.test(f.path));
    mine.length
      ? fail('nothing of this module is left standing in its own opening',
        `${mine.map((m) => m.path).join(', ')} still occludes the aperture centre`)
      : pass('nothing of this module is left standing in its own opening',
        `aperture centre reads ${JSON.stringify(occ.base)} against a lit interior wall at ${JSON.stringify(occ.control)}`);
  }

  // The same frame with the HOUSE taken away instead — the only picture that says
  // unambiguously WHERE on screen the outside is. Two ablations bracket the answer.
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.room.root.visible = false;
    e.player.root.visible = false;
    e.hunter.root.visible = false;
  });
  await step(2);
  await shot('ext-yard-only');
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.room.root.visible = true;
    e.player.root.visible = true;
    e.hunter.root.visible = true;
  });
  await step(2);

  // Out in the yard, and looking back at the house from it.
  await page.evaluate((sid) => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => q.site.id === sid);
    const n = x.panel.normal, p = x.panel.root.position, o = x.outSign;
    e.player.pos.set(p.x + n.x * o * 3.4, e.room.floorY, p.z + n.z * o * 3.4);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(n.x * o, n.z * o);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
  }, openIt.id);
  const sOut = await settle();
  const cOut = await census();
  note(`out in the yard: settled ${sOut.frames} frames - calls ${cOut.calls} - exterior ${cOut.extMesh} mesh / ${cOut.extTris} tris - resident spaces ${cOut.spaces}`);
  await bare();
  await shot('ext-in-the-yard');

  await page.evaluate((sid) => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => q.site.id === sid);
    const n = x.panel.normal, p = x.panel.root.position, o = x.outSign;
    e.player.pos.set(p.x + n.x * o * 7.0, e.room.floorY, p.z + n.z * o * 7.0);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-n.x * o, -n.z * o);      // turn round and face the house
    e.player.facing = yaw; e.player.aimYaw = yaw;
    // A real upward look, and it is not flattery: the yard builds a cornice, a roof mass and
    // two stacks so the house has a SILHOUETTE from out here, and an eye-level frame at 7 m
    // from a 4.8 m storey is entirely brick. (`dirAt`'s y is `-sin(pitch)`, so POSITIVE pitch
    // drops the lens and tilts it up; the default is -0.13, raised and looking down.)
    e.cam.yaw = yaw; e.cam.pitch = 0.30; e.cam._first = true;
  }, openIt.id);
  await settle();
  await bare();
  await shot('ext-looking-back');

  // Back to the way-out station for the collider check and the residency test.
  await stand(openIt.id, 4.2);
  await settle();

  // SOMEWHERE TO STAND: the yard's walls have to stop a body or the court is a painting.
  const walls = await page.evaluate((sid) => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => q.site.id === sid);
    const n = x.panel.normal, p = x.panel.root.position, o = x.outSign;
    const V = p.constructor;
    const solids = e.room.exteriorSolids ?? [];
    const pos = new V(p.x + n.x * o * 1.2, 0, p.z + n.z * o * 1.2);
    let travelled = 0;
    for (let i = 0; i < 400; i++) {
      const want = new V(pos.x + n.x * o * 0.15, 0, pos.z + n.z * o * 0.15);
      const got = e.room.collide(want, 0.32).clone();
      const d = Math.hypot(got.x - pos.x, got.z - pos.z);
      pos.copy(got);
      travelled += d;
      if (d < 0.002 && i > 4) break;
    }
    const outward = Math.abs((pos.x - p.x) * n.x * o + (pos.z - p.z) * n.z * o);
    return { solids: solids.length, travelled: +travelled.toFixed(2), stoppedAt: +outward.toFixed(2) };
  }, openIt.id);
  note(`yard colliders: ${walls.solids} registered - a body walking straight out stops ${walls.stoppedAt} m from the wall`);
  if (!on) skip('the yard is somewhere to stand, not a painting', 'ablated arm');
  else if (!walls.solids) fail('the yard is somewhere to stand, not a painting', 'no exterior colliders registered');
  else if (walls.stoppedAt > 40) fail('the yard is somewhere to stand, not a painting',
    `a body walked ${walls.stoppedAt} m out and was never stopped`);
  else pass('the yard is somewhere to stand, not a painting',
    `${walls.solids} colliders; a body walking out is stopped at ${walls.stoppedAt} m by the boundary wall`);

  const beyond = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    const V = p.constructor;
    const raw = e.room.castRay(new V(p.x + n.x * inS * 1.0, 1.35, p.z + n.z * inS * 1.0),
      new V(-n.x * inS, 0, -n.z * inS), 200);
    // ⚠️ `room.castRay` KNOWS ONLY ABOUT THE HOUSE and will keep answering "nothing within
    // 200 m" however much scenery is out there — it walks `spaces`, and outside is not a
    // space. The original black-rectangle diagnosis used it: correct about what it says (the
    // HOUSE ends here) and silent about what the camera sees.
    return { raw: raw ? +raw.distance.toFixed(2) : null,
      bg: e.scene.background ? '#' + e.scene.background.getHexString() : 'none' };
  });
  note(`through the opening: room.castRay ${beyond.raw == null ? 'nothing within 200 m' : beyond.raw + ' m'}`
    + ` (the house only) - scene background ${beyond.bg}`);
  note(`draw calls at the open exit: ${c1.calls} - tris ${c1.tris} - visible meshes ${c1.allMesh}`
    + ` - of which exterior ${c1.extMesh} / ${c1.extTris} tris - resident spaces ${c1.spaces}`);
  if (c1.yard.enabled) note(`yard residency: ${c1.yard.yards.map((y) => `${y.id} live=${y.live} exposed=${y.exposed}`).join(' - ')}`);

  if (!on) skip('an opened exit shows the outside', 'ablated arm — nothing is built by design');
  else if (c1.extMesh < 1) fail('an opened exit shows the outside', 'no exterior mesh visible from a station square in front of the open hole');
  else pass('an opened exit shows the outside',
    `${c1.extMesh} exterior mesh(es) / ${c1.extTris} tris resident and visible at the hole`);

  // =========================================================================
  // 2 - RESIDENCY. Walk back into the house and the outside leaves the bill.
  // =========================================================================
  const away = await page.evaluate(() => {
    const e = window.__rrr.engine;
    // ⚠️ THE STATION MUST BE IN A ROOM THAT CANNOT SEE THE LIVE EXIT, AND IT WAS HARDCODED TO
    // `ballroom.north`. HANDOFF's own warning bit here: appending ten sites re-rolled every
    // seed, and on `rrr-test-1` the live site is now `x.ballroom.south_w` — in the ballroom. So
    // this probe was parking in the SAME ROOM as the open hole and then asserting the yard had
    // left the bill. It reads as a residency regression and it is a station that moved.
    // ⚠️ AND IT MUST NOT BE A NEIGHBOUR OF IT EITHER. `study_w.south` is 3.15 m from D4, which
    // is inside `PORTAL_VIS_DIST`, so the ballroom is RESIDENT from there — correctly, because
    // you can see into it — and a yard behind an open hole in the ballroom's far wall is then
    // on the bill by design. Residency is conservative on purpose; the station has to be two
    // rooms away for "cannot see the exit" to be true.
    const home = e.exits.find((x) => x.site.id === e.run.exitId)?.site?.a;
    const far = (n) => {
      const sp = e.room.spaceAt(e.room.anchor(n));
      return sp && sp.id !== home && !sp.neighbours.has(home);
    };
    const pick = ['gallery.west', 'chapel.centre', 'ballroom.north', 'study_w.south'].find(far)
      ?? 'ballroom.north';
    const a = e.room.anchor(pick);
    e.player.pos.set(a.x, e.room.floorY, a.z);
    e.player.vel.set(0, 0, 0);
    e.player.facing = 0; e.player.aimYaw = 0;
    e.cam.yaw = 0; e.cam.pitch = 0; e.cam._first = true;
    return { at: [a.x, a.z], station: pick, liveIn: home };
  });
  await settle();
  const c2 = await census();
  note(`parked away from the exit at ${away.station} ${JSON.stringify(away.at)} (live site is in ${away.liveIn}):`
    + ` calls ${c2.calls} - exterior meshes ${c2.extMesh}`
    + ` - connector dressing ${c2.dressMesh} instanced mesh(es), always resident by design`);
  if (!on) skip('the outside is off the bill from inside the house', 'ablated arm');
  else if (c2.extMesh > 0) fail('the outside is off the bill from inside the house',
    `${c2.extMesh} exterior meshes still drawing from a room that cannot see the exit`);
  else pass('the outside is off the bill from inside the house',
    `0 exterior meshes visible; ${c2.calls} calls here against ${c1.calls} at the open hole`);

  // =========================================================================
  // 3 - THE TELL, at every site, at its round-start dressing, from a fixed station.
  // =========================================================================
  // Run this on two seeds and diff the same site's PNG: what varies is exactly live-vs-chained
  // at identical geometry under identical lighting, which is the only honest way to ask whether
  // the reading is learnable.
  const sites = await page.evaluate(() => window.__rrr.engine.exits.map((x) => x.site.id));
  const tell = [];
  for (const id of sites) {
    await page.evaluate((sid) => {
      const e = window.__rrr.engine;
      // Put the panel back the way the round started — the opening above broke one of them.
      const x = e.exits.find((q) => q.site.id === sid);
      const live = e.run.isLiveExit(sid);
      x.panel.state.stage = live ? e.run.lock.startStage : 0;
      x.panel.state.stageHealth = x.panel.state.defs[x.panel.state.stage].health;
      x.panel._recomputeBox(); x.panel._apply();
      e.exterior.setPlan({ liveId: e.run.exitId, lock: e.run.lock.id });
    }, id);
    await stand(id, 3.4);
    const s = await settle();
    const st = await page.evaluate((sid) => {
      const e = window.__rrr.engine;
      const x = e.exits.find((q) => q.site.id === sid);
      const s = e.exterior.sites?.get?.(sid);
      // ⚠️ THE DRESSING MOVED AND SO DID THE QUESTION. It used to be per-site meshes read off
      // `s.seam` / `s.chained` / `s.dressing`; it is four `InstancedMesh`es over EVERY connector
      // in the house now (`exterior.js`), and which cues a connector wears is a seeded property
      // of the connector rather than of its state unless `?tells=marked`. So the probe asks the
      // module what this connector is wearing, and the assertion below branches on the mode.
      const d = e.exterior.dressingOf?.(sid) ?? null;
      // ⚠️ ASK WHETHER IT REACHES THE SCREEN, NOT WHETHER ITS OWN FLAG IS SET. `s.draught` is
      // never individually hidden — its PARENT is — so `s.draught.visible` is true on a build
      // where nothing is drawn, and the `uStrength` uniform keeps whatever the last visible
      // frame left in it. Both read as a tell that is not there. Same class as HANDOFF's
      // "`root.visible = false` is not an ablation", from the other end.
      const drawn = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      return {
        live: e.run.isLiveExit(sid), stage: x.panel.state.stage, name: x.panel.state.def.name,
        mode: e.exterior.tells,
        seam: d ? !!d.seam : null,
        chained: d ? !!d.chain : null,
        dressing: d ? Object.keys(d).filter((k) => d[k]) : null,
        spill: s ? (drawn(s.spill) ? +s.spill.material.uniforms.uStrength.value.toFixed(3) : 0) : null,
        draught: s ? drawn(s.draught) : null,
        tellVisible: s ? drawn(s.light) : null,
      };
    }, id);
    tell.push({ id, ...st, drift: s.drift });
    note(`${id}: ${st.live ? 'LIVE' : 'chained'} stage ${st.stage} (${st.name})`
      + ` - seam ${st.seam} - spill ${st.spill} - draught ${st.draught}`
      + ` - chain ${st.chained} - dressing ${JSON.stringify(st.dressing)}`);
    await shot(`ext-tell-${id.replace(/\./g, '_')}`);
  }

  // Two shots of the SAME station a few frames apart, so the room's own breathing lights and
  // the grade's animated grain give a NOISE FLOOR to judge live-vs-chained against.
  // `commit-tell.mjs`'s method: a difference smaller than the frame's own churn is not a tell.
  await step(20);
  await shot(`ext-tell-noise-${sites[sites.length - 1].replace(/\./g, '_')}`);

  // ⚠️ THE ASSERTION IS NOW MODE-DEPENDENT AND BOTH ARMS ARE REAL, because `?tells=` decides
  // which of two contradictory designs is in force. `marked` is the shipped one this scenario
  // was written for and its claim is unchanged. `blind` is `procedural-map.md` §2 and its claim
  // is the OPPOSITE: a closed connector must give nothing away, so the live exit is required to
  // look like everything else. Running this file on one mode and quoting it about the other is
  // the mistake this branch exists to prevent.
  const liveRows = tell.filter((r) => r.live);
  const deadRows = tell.filter((r) => !r.live);
  const mode = tell[0]?.mode ?? 'blind';
  if (!on) {
    skip('the dressing follows the mode', 'ablated arm');
  } else if (!liveRows.length) {
    fail('the dressing follows the mode', 'no live site in this plan');
  } else if (mode === 'marked') {
    const leaks = liveRows.every((r) => r.seam && r.spill > 0 && r.draught && r.tellVisible !== false);
    const flat = deadRows.every((r) => r.chained === true && r.tellVisible === false);
    if (!leaks) fail('marked: a live exit leaks', JSON.stringify(liveRows));
    else if (!flat) fail('marked: a chained exit is dead flat and carries hardware', JSON.stringify(deadRows));
    else pass('marked: a live exit leaks and a chained one does not',
      `live ${liveRows[0].id}: seam on, spill ${liveRows[0].spill}, draught on;`
      + ` ${deadRows.length} chained sites: chain and padlock on, no tell`);
  } else if (mode === 'blind') {
    // The live exit may or may not wear a chain and may or may not wear a seam — that is the
    // point — so what is asserted is that nothing about it is RESERVED to it. The two daylight
    // cues must be off while it still blocks sight, and its hardware must be a combination that
    // some other connector could equally be wearing.
    const closed = liveRows.filter((r) => r.stage <= 2);
    const quiet = closed.every((r) => !r.draught && r.tellVisible === false);
    if (!closed.length) skip('blind: a closed live exit gives nothing away', 'this seed opened at the beam stage');
    else if (!quiet) fail('blind: a closed live exit gives nothing away', JSON.stringify(closed));
    else pass('blind: a closed live exit gives nothing away',
      `${closed.length} closed live station(s): no draught, no spill, hardware `
      + `${JSON.stringify(closed[0].dressing)} drawn from the same seeded pool as every other connector`);
  } else {
    skip('the dressing follows the mode', `tells=${mode}`);
  }

  const moving = tell.filter((r) => r.drift >= 0.0015);
  moving.length
    ? fail('every station photographed a settled camera', moving.map((m) => `${m.id} ${m.drift}`).join(', '))
    : pass('every station photographed a settled camera', `residual drift under 1.5 mm/frame at ${tell.length} stations`);
}
