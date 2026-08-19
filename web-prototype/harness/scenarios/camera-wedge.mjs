/**
 * DOES AN ORDINARY NAVIGATION MISTAKE PRODUCE THE LEAST LEGIBLE SCREEN IN THE GAME?
 *
 * play-critic-5's highest-leverage complaint, in its own words: walking into geometry at
 * anything but a precise angle collapses the third-person view into "a macro-close wall/floor
 * texture, HUD barely legible". It hit the same wedge TWICE by two independent navigation
 * strategies — holding W blindly, and re-aiming at a goal every ~800 ms the way a player who
 * glances at the screen does — and found that re-aiming at the goal does NOT free you: only a
 * substantial turn AWAY from the wall restores a readable frame.
 *
 * ⚠️ THE OBVIOUS FIX IS ALREADY RECORDED AS WORSE. `player.js`'s ThirdPersonCamera documents a
 * hard 1.55 m boom floor as TRIED AND MEASURED AND REJECTED: these walls are 4.8 m of a 4.8 m
 * storey, so a floor that large punches the camera through the wall and the frame becomes a
 * black slab. So this file must not measure "is the boom long" — it must measure LEGIBILITY,
 * which is what the player actually loses, and a fix is only allowed to move that number.
 *
 * THE METRIC IS GEOMETRIC, NOT PHOTOGRAPHIC, and that is deliberate. A screenshot's mean luma
 * cannot tell "a close-up of a wall" from "a dark room": both are dim and flat, and one of them
 * is the game working. So the frame is measured by casting a 9 x 7 grid of rays out of the REAL
 * camera through the REAL frustum and asking how much of the picture is a surface within arm's
 * reach:
 *
 *   nearFrac   fraction of view rays hitting geometry inside NEAR_M (1.20 m). At 1.00 every
 *              pixel of the frame is a surface you could touch — a macro texture, by definition.
 *   medDepth   median hit distance. How deep the picture is.
 *   inside     how far `room.collide` has to push a 0.02 m sphere at the camera position to get
 *              it out of solid geometry. Non-zero means the boom penetrated, which is the exact
 *              failure the current design exists to prevent — a fix must not trade one for the
 *              other.
 *
 * Screenshots are taken at the worst frame of each strategy so the numbers can be checked
 * against a picture, which is the project's rule.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/camera-wedge.mjs \
 *     --port 5197 --shots
 *
 * VALIDATION — and this suite is worthless without it. `BREAK=old` restores the pre-fix camera
 * at runtime: `cam.sideClamp = false` puts the shoulder probe back inside the wall and
 * `cam.cueEnabled = false` silences the cue. Both assertions MUST go red. A test that has only
 * ever run against working code proves nothing; five instruments on this project have returned
 * confident wrong answers.
 */

const BREAK = process.env.BREAK ?? '';

/** A view ray inside this is "a surface you could touch" — not a room, a texture. */
const NEAR_M = 1.20;
/**
 * ILLEGIBLE, DEFINED. The MEDIAN view ray hits inside NEAR_M — i.e. more than half the picture
 * is a surface within arm's reach. That is "a macro-close wall/floor texture" as a number.
 *
 * ⚠️ AND IT HAD TO BE THE MEDIAN, NOT THE FRACTION, WHICH THE FIRST VERSION GOT WRONG AND WOULD
 * HAVE FAILED A WORKING BUILD ON. Judged by "what fraction of rays land near", the worst spot in
 * the house came out as a camera standing in a DOORWAY: 40% of its rays hit the wall around the
 * opening while the median ray reached **8.69 m** down the next room. That is not an illegible
 * frame, that is a doorway with a frame around it, and the metric was about to demand it be
 * fixed. A frame is unreadable when it has no depth ANYWHERE, so measure the depth.
 */
const BLIND_MED = 1.20;
/** ...and the player's own eye seeing at least this far is what makes it the CAMERA's fault. */
const EYE_OK = 2.00;

export default async function cameraWedge({ page, note, pass, fail, skip, shot, snap, waitFor }) {
  if (!await page.evaluate(() => !!window.__rrr?.engine?.room)) {
    skip('camera wedge', 'engine.room not exposed'); return;
  }

  // ------------------------------------------------------------------ rig
  await page.evaluate(() => {
    if (window.__cwInstalled) return;
    window.__cwInstalled = true;
    const e = window.__rrr.engine;

    /**
     * LEGIBILITY OF THE FRAME THAT IS ACTUALLY ON SCREEN.
     *
     * Rays are built from the camera's own world matrix and fov, so this measures the shipped
     * projection rather than a re-derivation of it that could drift. `room.castRay` wants a
     * real Vector3 for the origin (it calls `.clone()`), which `camera.position.clone()` is.
     */
    const grid = (origin, basis, cols, rows, maxD) => {
      const room = e.room, cam = e.camera;
      const [rx, ry, rz, ux, uy, uz, fx, fy, fz] = basis;
      const tanH = Math.tan((cam.fov * Math.PI / 180) / 2);
      const dir = origin.clone();
      const hits = [];
      let near = 0, n = 0;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const u = (cols === 1 ? 0 : (i / (cols - 1)) * 2 - 1) * tanH * cam.aspect;
          const v = (rows === 1 ? 0 : (j / (rows - 1)) * 2 - 1) * tanH;
          dir.set(fx + rx * u + ux * v, fy + ry * u + uy * v, fz + rz * u + uz * v).normalize();
          const h = room.castRay(origin, dir, maxD);
          const d = h ? h.distance : maxD;
          hits.push(d);
          if (d < 1.20) near++;
          n++;
        }
      }
      hits.sort((a, b) => a - b);
      return { nearFrac: +(near / n).toFixed(3), medDepth: +hits[hits.length >> 1].toFixed(2),
        minDepth: +hits[0].toFixed(2) };
    };

    window.__camLegibility = (cols = 9, rows = 7, maxD = 30) => {
      const cam = e.camera;
      const m = cam.matrixWorld.elements;
      return grid(cam.position.clone(),
        [m[0], m[1], m[2], m[4], m[5], m[6], -m[8], -m[9], -m[10]], cols, rows, maxD);
    };

    /**
     * ⚠️ THE CONTROL, AND WITHOUT IT THIS WHOLE FILE MEASURES THE WRONG THING.
     *
     * "Most of the frame is a surface within arm's reach" is ALSO what a correct camera shows a
     * player who has walked nose-first into a wall and is still holding W. That is not a defect,
     * it is a wall; a camera that invented depth there would be the bug. The first version of
     * this suite could not tell the two apart and would have demanded a fix for physics.
     *
     * So the same 5x5 grid is cast from the PLAYER'S OWN EYE along their aim, and the reported
     * quantity is the DEFICIT — how much more of the frame the camera buries than the player's
     * own viewpoint would. That is exactly play-critic-5's complaint stated as a number: it
     * re-aimed at a goal it could see, and the camera still showed it plaster.
     */
    window.__eyeLegibility = (cols = 5, rows = 5, maxD = 30) => {
      const p = e.player;
      const o = p.pos.clone(); o.y += p.eyeHeight * 0.94;
      const y = p.aimYaw, pit = p.aimPitch ?? 0;
      const cp = Math.cos(pit);
      // forward from the aim; right = forward x up; up = right x forward
      const fx = Math.sin(y) * cp, fy = Math.sin(pit), fz = Math.cos(y) * cp;
      const rx = -Math.cos(y), rz = Math.sin(y);
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      const un = Math.hypot(ux, uy, uz) || 1;
      return grid(o, [rx, 0, rz, ux / un, uy / un, uz / un, fx, fy, fz], cols, rows, maxD);
    };

    /**
     * SWEEP THE WHOLE HOUSE INSTEAD OF HOPING A WALK LANDS ON THE BAD SPOT.
     *
     * Three staged walks are evidence about three places. The claim under test is about EVERY
     * place a player can press themselves into, so every hazard in the floor plan — both jambs
     * of all seven doorways, all twenty-four inside corners, both faces of all six ballroom
     * piers, the service passage's walls — is visited at eight headings and the worst frame is
     * reported. That is 488 real camera solves, and it is affordable because `cam._first`
     * exists: setting it snaps the boom spring and the `tight` smoother, so one frame per
     * sample is the settled answer rather than a frame of a spring still arriving.
     *
     * ⚠️ THE HOOK RUNS AFTER THE GAME'S OWN UPDATER, which is the only ordering that works: a
     * sample staged at the end of frame F is solved by `cam.update` during F+1 and read at the
     * end of F+1. Staged and read in the same frame it would photograph the PREVIOUS pose, and
     * every number would be shifted by one sample — plausible, wrong, and completely silent.
     */
    window.__runSurvey = (pts) => new Promise((resolve) => {
      const out = [];
      let i = -1, pending = null;
      const savedX = e.player.pos.x, savedZ = e.player.pos.z, savedYaw = e.cam.yaw;
      const tick = () => {
        if (pending) {
          const leg = window.__camLegibility(5, 5, 30);
          const eye = window.__eyeLegibility(5, 5, 30);
          out.push({ ...pending, ...leg, eyeNear: eye.nearFrac, eyeMed: eye.medDepth,
            deficit: +Math.max(0, Math.min(eye.medDepth, 8) - leg.medDepth).toFixed(2),
            blind: leg.medDepth <= 1.20 && eye.medDepth >= 2.00,
            tight: +(e.cam._tight ?? 0).toFixed(3),
            boom: +(e.cam.lastDistance ?? 0).toFixed(3), inside: window.__camInside() });
          pending = null;
        }
        i++;
        if (i >= pts.length) {
          window.__surveyTick = null;
          e.player.pos.set(savedX, 0, savedZ); e.player.vel.set(0, 0, 0);
          e.cam.yaw = savedYaw; e.cam._first = true;
          resolve(out);
          return;
        }
        const p = pts[i];
        e.player.pos.set(p.x, 0, p.z);
        e.player.vel.set(0, 0, 0);
        e.cam.yaw = p.yaw; e.player.aimYaw = p.yaw; e.player.facing = p.yaw;
        e.cam._first = true;
        // The cue is a TIMED latch and this sweep teleports; letting it accumulate here would
        // count 488 unrelated poses as one long wedge. It is exercised separately, in play.
        e.cam._wedgeT = 0;
        pending = { ...p };
      };
      window.__surveyTick = tick;
      if (!window.__surveyHooked) {
        window.__surveyHooked = true;
        e.onUpdate(() => { if (window.__surveyTick) window.__surveyTick(); });
      }
    });

    /** How far a 0.02 m sphere at the camera has to be pushed to leave solid geometry. */
    window.__camInside = () => {
      const cam = e.camera, room = e.room;
      const p = cam.position.clone();
      const out = room.collide(p, 0.02);
      return +Math.hypot(out.x - p.x, out.z - p.z).toFixed(3);
    };

    /** One frame's worth of camera truth. Sampled from an updater so it is per-frame, not polled. */
    window.__cw = { rec: false, samples: [], worst: null, catchAt: null, freeze: null };
    e.onUpdate(() => {
      const c = window.__cw;
      // ---- POSE FREEZE. See the A/B block: the honest before/after is the SAME pose out of a
      // real driven walk photographed under two cameras, not two teleports that land near each
      // other. Re-applied every frame (after the game's own updater, so it is what the next
      // `cam.update` reads) which pins the body against the geometry exactly as the walk left it.
      if (c.freeze) {
        e.player.pos.set(c.freeze.x, 0, c.freeze.z);
        e.player.vel.set(0, 0, 0);
        e.cam.yaw = c.freeze.yaw; e.player.aimYaw = c.freeze.yaw; e.player.facing = c.freeze.yaw;
      }
      if (!c.rec) return;
      const cam = e.cam, p = e.player;
      const leg = window.__camLegibility(5, 5, 30);
      const eye = window.__eyeLegibility(5, 5, 30);
      const s = {
        eyeNear: eye.nearFrac, eyeMed: eye.medDepth,
        // Metres of depth the camera threw away that the player's own eye had. Capped at the
        // eye's own reading, so a 30 m vista does not out-shout a genuine 3 m collapse.
        deficit: +Math.max(0, Math.min(eye.medDepth, 8) - leg.medDepth).toFixed(2),
        blind: leg.medDepth <= 1.20 && eye.medDepth >= 2.00,
        t: +(performance.now() / 1000).toFixed(2),
        px: +p.pos.x.toFixed(2), pz: +p.pos.z.toFixed(2),
        yaw: +cam.yaw.toFixed(3),
        tight: +(cam._tight ?? 0).toFixed(3),
        boom: +(cam.lastDistance ?? 0).toFixed(3),
        hidden: !!cam.modelHidden,
        cue: !!cam.unwedgeCue,
        // The HUD nudge lives 2.4 s. Reading it after a 4.5 s hold reports `null` and looks
        // exactly like a callback that was never wired — sample it per frame instead.
        nudge: e.gameHud?._nudgeState?.()?.turn ?? null,
        ...leg,
        inside: window.__camInside(),
      };
      c.samples.push(s);
      // Worst = the frame where the camera threw away the most depth the player's eye had.
      if (!c.worst || s.deficit > c.worst.deficit
        || (s.deficit === c.worst.deficit && s.medDepth < c.worst.medDepth)) c.worst = s;
      if (c.catchAt != null && !c.freeze && s.deficit >= c.catchAt) {
        c.freeze = { x: s.px, z: s.pz, yaw: s.yaw, at: s };
      }
      if (c.samples.length > 4000) c.samples.shift();
    });
  });

  // ⚠️ PIN THE RENDER SCALE before any screenshot comparison. `Engine._liveLoop` nudges
  // `pipeline.renderScale` toward the frame budget every frame, which resamples the whole image
  // whenever cost moves — indistinguishable from a real change. Same trap as commit-tell.mjs.
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.opts.dynamicRes = false;
    e.pipeline.renderScale = 1.0;
  });

  if (BREAK === 'old') {
    await page.evaluate(() => {
      const c = window.__rrr.engine.cam;
      // ⚠️ A REVERT HAS TO BE CHECKED AS CAREFULLY AS A FIX — commit-tell.mjs's first BREAK did
      // not actually revert and the "broken" build still passed. All three channels go back:
      //   sideClamp=false   the shoulder probe sits inside the wall again, so `free` misreads,
      //                     `tight` snaps to 1 and SHOULDER_SWING drives the rig deeper in
      //   pinchMin=hardMin  the boom is clamped UP to 0.42 m against a nearer wall again, i.e.
      //                     0.30 m past the surface — the clamp that WAS the penetration
      //   cueEnabled=false  nothing on screen says which way to turn
      c.sideClamp = false;
      c.pinchMin = c.hardMin;
      c.cueEnabled = false;
    });
    note('BREAK=old — the shoulder clamp, the pinch floor and the unwedge cue are all reverted at runtime; the assertions below MUST fail.');
  }

  const startRec = () => page.evaluate(() => { window.__cw.rec = true; window.__cw.samples = []; window.__cw.worst = null; });
  const stopRec = () => page.evaluate(() => { window.__cw.rec = false; return { worst: window.__cw.worst, n: window.__cw.samples.length,
    samples: window.__cw.samples }; });

  /** Put the player exactly where a round starts, so "an ordinary mistake" means what it says. */
  const stage = async () => {
    await page.evaluate(() => {
      const e = window.__rrr.engine;
      e.resetRound();
      // The hunter is not the subject here and a chase would confound the walk. Park it in the
      // ballroom's far corner in PATROL — it is 25 m and two walls away from the study.
      e.hunter.root.position.set(9.0, 0, 4.2);
      e.hunter.awareness = 0;
    });
    await page.waitForTimeout(2200);   // let the boom spring settle — see commit-tell.mjs
  };

  /**
   * STRATEGY 1 — HOLD W AND LOOK AT NOTHING. The critic's first run, verbatim: a new player who
   * has been told the controls, points themselves at the house and walks.
   */
  const holdW = async (seconds) => {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(seconds * 1000);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
  };

  /**
   * STRATEGY 2 — RE-AIM AT THE GOAL EVERY 800 ms. The critic's second run: a player who glances
   * at the screen, sees they are off course, and points at where they want to be. The finding
   * that matters is that this does NOT free you, because the goal is still on the far side of
   * the wall you are pressed into.
   */
  const reaimTo = async (gx, gz, seconds, every = 800) => {
    await page.keyboard.down('KeyW');
    const steps = Math.round((seconds * 1000) / every);
    for (let i = 0; i < steps; i++) {
      await page.evaluate(([gx, gz]) => {
        const e = window.__rrr.engine;
        const yaw = Math.atan2(gx - e.player.pos.x, gz - e.player.pos.z);
        e.cam.yaw = yaw; e.player.aimYaw = yaw;
      }, [gx, gz]);
      await page.waitForTimeout(every);
    }
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
  };

  const report = (tag, r) => {
    const w = r.worst;
    if (!w) { note(`${tag}: no samples`); return null; }
    const blind = r.samples.filter((s) => s.blind).length;
    const secs = +(blind / 60).toFixed(1);
    const tightest = r.samples.reduce((a, b) => (b.tight > a.tight ? b : a), r.samples[0]);
    note(`${tag}: WORST frame threw away ${w.deficit} m of depth — camera median ${w.medDepth} m`
      + ` (${w.nearFrac} of the frame inside ${NEAR_M} m) against the eye's ${w.eyeMed} m · boom ${w.boom} m`
      + ` · tight ${w.tight} · model ${w.hidden ? 'HIDDEN' : 'shown'} · in geometry by ${w.inside} m · at (${w.px}, ${w.pz})`);
    note(`${tag}: ${secs}s BLIND (camera median <= ${BLIND_MED} m while the eye saw >= ${EYE_OK} m)`
      + ` — ${blind}/${r.n} frames · tightest boom of the walk ${tightest.boom} m at tight ${tightest.tight}`);
    return { ...w, blindFrames: blind, blindSecs: secs, frames: r.n, tightest };
  };

  // ---------------------------------------------------------------- run 1: blind W
  //
  // ⚠️ THE SPAWN YAW MATTERS AND IT IS NOT THE SPAWN FACING. `resetRound` leaves `cam.yaw` at
  // PI (north, -Z) and W drives along `cam.yaw` — that is the same coupling that made the old
  // flee-survival.mjs run its "fleeing" player 3.4 m into a wall and measure the attack radius.
  // Here it is the POINT: the critic's blind-W player is walking wherever the camera looks.
  await stage();
  await startRec();
  await holdW(9);
  const r1 = await report('blind-W', await stopRec());
  await shot('wedge-blindW');

  // ---------------------------------------------------------------- run 2: re-aim at a goal
  //
  // The goal is the gallery's east end — a real destination a player can see from the study's
  // doorway, reachable only by going through D1 and turning right. Walking at it in a straight
  // line runs you into the gallery's north-east geometry, which is exactly the mistake.
  await stage();
  await startRec();
  await reaimTo(12.0, -30.6, 12);
  const r2 = await report('reaim-at-goal', await stopRec());
  await shot('wedge-reaim');

  // ---------------------------------------------------------------- run 3: the corner press
  //
  // The reproducible core of both, staged rather than walked into, so the assertion does not
  // depend on a 12 s walk landing in the same place every run. `wall.back` is the anchor that
  // already exists for "solid wall behind the player" (see spaces.js); pressing INTO the
  // south-west angle of the west study with W held is one continuous input and the most
  // ordinary mistake in the game.
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.resetRound();
    e.hunter.root.position.set(9.0, 0, 4.2); e.hunter.awareness = 0;
    // The west study's north-west inside corner: x0 = -13.60, z0 = -24.00. Stand 2 m off it
    // and aim into it, so holding W presses the body into two walls at 45 degrees.
    e.player.pos.set(-11.4, 0, -21.8);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-13.6 - e.player.pos.x, -24.0 - e.player.pos.z);
    e.cam.yaw = yaw; e.player.aimYaw = yaw; e.player.facing = yaw;
  });
  await page.waitForTimeout(2200);
  await startRec();
  await holdW(4);
  const r3 = await report('corner-press', await stopRec());
  await shot('wedge-corner');

  // ---------------------------------------------------------------- run 4: does re-aiming free you?
  //
  // The critic's key observation. From the wedge, aim back at the goal (a modest re-aim, the
  // thing a player does first) and hold; then turn substantially AWAY and hold. If only the
  // second recovers, the player has no way to learn what to do — hence the cue.
  const sampleFor = async (ms) => {
    await startRec();
    await page.waitForTimeout(ms);
    const r = await stopRec();
    const ns = r.samples.map((s) => s.medDepth).sort((a, b) => a - b);
    return { median: ns.length ? +ns[ns.length >> 1].toFixed(2) : null, n: ns.length };
  };
  const setYaw = (y) => page.evaluate((y) => {
    const e = window.__rrr.engine;
    e.cam.yaw = y; e.player.aimYaw = y;
  }, y);

  const wedgeYaw = await page.evaluate(() => window.__rrr.engine.cam.yaw);
  const inWedge = await sampleFor(900);
  await setYaw(wedgeYaw + 0.45);                    // a modest re-aim, still into the corner
  await page.waitForTimeout(900);
  const reaimed = await sampleFor(900);
  await shot('wedge-reaim-small');
  await setYaw(wedgeYaw + Math.PI * 0.75);          // a substantial turn away
  await page.waitForTimeout(1400);
  const turned = await sampleFor(900);
  await shot('wedge-turned-away');
  note(`recovery (camera median depth, m): wedged ${inWedge.median} · after a 0.45 rad re-aim ${reaimed.median}`
    + ` · after a 2.36 rad turn away ${turned.median}`);

  // ---------------------------------------------------------------- the whole-house survey
  //
  // Built from the same numbers `spaces.js` builds the house from, so it cannot drift out of
  // date silently the way the six scenarios that hardcoded pre-mansion coordinates did.
  const SP = [
    ['gallery', -13.60, 13.60, -31.00, -24.30], ['study_w', -13.60, -2.00, -24.00, -8.60],
    ['service', -1.70, 1.70, -24.00, -8.60], ['study_e', 2.00, 13.60, -24.00, -8.60],
    ['ballroom', -13.60, 13.60, -8.30, 7.00], ['chapel', 4.20, 11.00, -37.80, -31.30],
  ];
  const DOORS = [[-8.60, -24.15, 1.90], [0.00, -24.15, 1.90], [8.60, -24.15, 1.90],
    [-8.60, -8.45, 1.90], [0.00, -8.45, 1.90], [8.60, -8.45, 1.90], [7.60, -31.15, 1.20]];
  const PIERS = [-11.0, -6.6, -2.2, 2.2, 6.6, 11.0];
  const OFF = 0.42;                       // just inside the player's own collision radius
  const spots = [];
  for (const [, x0, x1, z0, z1] of SP) {
    for (const x of [x0 + OFF, x1 - OFF]) for (const z of [z0 + OFF, z1 - OFF]) spots.push([x, z]);
  }
  for (const [x, z, w] of DOORS) {
    const d = w / 2 - 0.36;
    // Doors on the gallery/ballroom walls run along X, so a jamb press is an X offset.
    spots.push([x, z], [x - d, z], [x + d, z]);
  }
  for (const px of PIERS) spots.push([px, -1.55], [px - 0.90, -0.65]);
  spots.push([-1.28, -16.0], [1.28, -16.0], [-1.28, -22.5], [1.28, -22.5]);
  const pts = [];
  for (const [x, z] of spots) {
    for (let k = 0; k < 8; k++) pts.push({ x: +x.toFixed(2), z: +z.toFixed(2), yaw: +(k * Math.PI / 4).toFixed(3) });
  }
  /** Run the survey under a named camera configuration and summarise it. */
  const surveyUnder = async (label, cfg) => {
    await page.evaluate((cfg) => {
      const c = window.__rrr.engine.cam;
      c.sideClamp = cfg.sideClamp; c.leadClamp = cfg.leadClamp;
      c.pinchMin = cfg.pinch ? 0.12 : c.hardMin;
    }, cfg);
    const rows = await page.evaluate((pts) => window.__runSurvey(pts), pts);
    const blind = rows.filter((s) => s.blind).length;
    const pen = rows.filter((s) => s.inside > 0.05).length;
    const worstMed = rows.reduce((a, b) => (b.medDepth < a.medDepth ? b : a));
    const lost = rows.reduce((a, b) => (b.deficit > a.deficit ? b : a));
    note(`  ${label.padEnd(30)} blind ${String(blind).padStart(3)}/488 · in-geometry ${String(pen).padStart(3)}`
      + ` · shallowest camera ${worstMed.medDepth} m (eye ${worstMed.eyeMed} m) · most depth lost ${lost.deficit} m`);
    return { label, rows, blind, pen, worstMed, lost };
  };

  // ---------------------------------------------------------------- ablation
  //
  // ⚠️ THE SHIPPED COMBINATION WAS CHOSEN BY THIS TABLE, NOT BY ARGUMENT, AND TWO CANDIDATE
  // CHANGES WERE REJECTED BY IT. Every row is the SAME 488 solves, back to back inside one
  // session, which is what an ablation needs (see HANDOFF's note on why absolute perf numbers
  // from different sessions cannot be compared but same-window ablations can).
  //
  // In particular: lowering the boom's floor (`pinch`) is a plainly reasonable idea that
  // measures WORSE on its own — 24 blind spots and 18 camera-in-geometry solves — because
  // `LEAD` was pushing the look target, and with it the lens, into the wall in front. It is only
  // safe once the lead is clamped too. Neither is obvious from reading the code.
  note('ABLATION — the same 488 solves under each camera configuration:');
  const abl = [];
  abl.push(await surveyUnder('pre-fix (all three off)', { sideClamp: false, leadClamp: false, pinch: false }));
  abl.push(await surveyUnder('side clamp only', { sideClamp: true, leadClamp: false, pinch: false }));
  abl.push(await surveyUnder('side + pinch, no lead clamp', { sideClamp: true, leadClamp: false, pinch: true }));
  abl.push(await surveyUnder('side + lead, no pinch', { sideClamp: true, leadClamp: true, pinch: false }));
  abl.push(await surveyUnder('SHIPPED (all three)', { sideClamp: true, leadClamp: true, pinch: true }));

  // ---------------------------------------------------------------- the before/after pair
  //
  // ONE POSE, TWO CAMERAS. The pose is the one the critic's own "re-aim at the goal" strategy
  // walked into: the west study's north-east inside corner, aiming at the gallery's east end.
  // Staged rather than walked so the two photographs are of the SAME world and the pair is a
  // real A/B rather than two runs that happened to end up near each other.
  const setCfg = (cfg) => page.evaluate((cfg) => {
    const c = window.__rrr.engine.cam;
    c.sideClamp = cfg.sideClamp; c.leadClamp = cfg.leadClamp;
    c.pinchMin = cfg.pinch ? 0.12 : c.hardMin;
  }, cfg);
  const readCam = () => page.evaluate(() => {
    const leg = window.__camLegibility(5, 5, 30), eye = window.__eyeLegibility(5, 5, 30);
    const c = window.__rrr.engine.cam;
    return { med: leg.medDepth, near: leg.nearFrac, eyeMed: eye.medDepth,
      boom: +c.lastDistance.toFixed(2), tight: +c._tight.toFixed(2), inside: window.__camInside() };
  });

  await setCfg({ sideClamp: false, leadClamp: false, pinch: false });
  await stage();
  await page.evaluate(() => { window.__cw.catchAt = 2.5; window.__cw.freeze = null; });
  await startRec();
  await page.keyboard.down('KeyW');
  const caught = await waitFor(() => window.__cw.freeze?.at ?? null, { timeout: 20000, every: 100 });
  for (let i = 0; i < 15 && !caught; i++) {
    await page.evaluate(([gx, gz]) => {
      const e = window.__rrr.engine;
      const y = Math.atan2(gx - e.player.pos.x, gz - e.player.pos.z);
      e.cam.yaw = y; e.player.aimYaw = y;
    }, [12.0, -30.6]);
    await page.waitForTimeout(800);
  }
  await page.keyboard.up('KeyW');
  await stopRec();
  let abBefore = null, abAfter = null;
  const frozen = await page.evaluate(() => window.__cw.freeze);
  if (!frozen) {
    note('A/B: the pre-fix camera never crossed the catch threshold on this walk — no pair captured');
  } else {
    await page.waitForTimeout(900);
    abBefore = await readCam();
    await shot('ab-before');
    await setCfg({ sideClamp: true, leadClamp: true, pinch: true });
    await page.waitForTimeout(1600);          // same pose, the boom re-solves
    abAfter = await readCam();
    await shot('ab-after');
    note(`A/B — ONE POSE OUT OF A REAL DRIVEN WALK, TWO CAMERAS. Frozen at (${frozen.x}, ${frozen.z})`
      + ` yaw ${frozen.yaw}; the player's own eye sees ${abAfter.eyeMed} m from there either way.`);
    note(`  BEFORE  camera median depth ${abBefore.med} m · ${abBefore.near} of the frame inside ${NEAR_M} m`
      + ` · boom ${abBefore.boom} m · tight ${abBefore.tight} · in geometry by ${abBefore.inside} m   [game.play.ab-before.png]`);
    note(`  AFTER   camera median depth ${abAfter.med} m · ${abAfter.near} of the frame inside ${NEAR_M} m`
      + ` · boom ${abAfter.boom} m · tight ${abAfter.tight} · in geometry by ${abAfter.inside} m   [game.play.ab-after.png]`);
  }
  await page.evaluate(() => { window.__cw.freeze = null; window.__cw.catchAt = null; });

  const survey = abl[abl.length - 1].rows.slice();
  survey.sort((a, b) => (b.deficit - a.deficit) || (a.medDepth - b.medDepth));
  const sWorst = survey[0];
  const bad = survey.filter((s) => s.blind);
  const pen = survey.filter((s) => s.inside > 0.05);
  // The genuinely tightest camera in the house, which is NOT the same spot as the worst frame —
  // that is the whole point of the fix. It is what the cue has to answer, so it is staged below.
  const sTight = survey.reduce((a, b) => (b.tight > a.tight || (b.tight === a.tight && b.boom < a.boom) ? b : a));
  note(`SURVEY ${survey.length} camera solves over ${spots.length} hazard spots x 8 headings`
    + ` (every jamb of all 7 doors, all 24 inside corners, both faces of all 6 piers, the passage walls)`);
  note(`SURVEY worst: threw away ${sWorst.deficit} m of depth — camera median ${sWorst.medDepth} m against`
    + ` the eye's ${sWorst.eyeMed} m, boom ${sWorst.boom} m, tight ${sWorst.tight}, at (${sWorst.x}, ${sWorst.z}) yaw ${sWorst.yaw}`);
  note(`SURVEY BLIND (camera median <= ${BLIND_MED} m while the eye saw >= ${EYE_OK} m): ${bad.length} of ${survey.length}`
    + ` · camera in geometry by >0.05 m: ${pen.length}`);
  note(`SURVEY tightest camera: boom ${sTight.boom} m, tight ${sTight.tight}, camera median ${sTight.medDepth} m`
    + ` vs eye ${sTight.eyeMed} m, at (${sTight.x}, ${sTight.z}) yaw ${sTight.yaw}`);
  for (const s of survey.slice(0, 3)) {
    note(`  worst #${survey.indexOf(s) + 1}: (${s.x}, ${s.z}) yaw ${s.yaw} -> threw away ${s.deficit} m`
      + ` (cam median ${s.medDepth} m vs eye ${s.eyeMed} m), boom ${s.boom} m, tight ${s.tight}, blind=${s.blind}`);
  }

  // ---------------------------------------------------------------- the cue, in a real wedge
  //
  // ⚠️ AND THIS IS WHY THE CUE STILL HAS TO EXIST. The shoulder clamp fixes the case where the
  // rig only THOUGHT it was cornered. It cannot fix a player who genuinely is — and the survey
  // above names the worst such spot in the house rather than letting this file guess one. The
  // cue is driven from the real latch, in real play, with W held into the geometry.
  await page.evaluate((w) => {
    const e = window.__rrr.engine;
    e.resetRound();
    e.hunter.root.position.set(9.0, 0, 4.2); e.hunter.awareness = 0;
    e.player.pos.set(w.x, 0, w.z); e.player.vel.set(0, 0, 0);
    e.cam.yaw = w.yaw; e.player.aimYaw = w.yaw; e.player.facing = w.yaw;
    e.cam._first = true;
    e.cam.cueFired = 0; e.cam._cueArmed = true; e.cam._wedgeT = 0;
  }, sTight);
  await page.waitForTimeout(1500);
  // THE WORST FRAME IN THE HOUSE, PHOTOGRAPHED. The survey reports it as a number; the project's
  // rule is that a claim about what is on screen is checked against a picture of that screen.
  // Taken before the walk, at the settled pose, so `BREAK=old` and the fixed build photograph
  // the identical camera problem and the pair is a real before/after.
  await shot('worst-pose');
  await startRec();
  await holdW(4.5);
  const rcRaw = await stopRec();
  const rc = report('cue-wedge', rcRaw);
  await shot('wedge-cue');
  const nudged = rcRaw.samples.filter((s) => s.nudge);
  const cueSeen = {
    fired: await page.evaluate(() => window.__rrr.engine.cam.cueFired),
    turn: nudged.length ? nudged[0].nudge : null,
    frames: nudged.length,
  };
  note(`cue at the survey's worst spot: fired ${cueSeen.fired}x · HUD showed a TURN`
    + ` ${cueSeen.turn ?? '(nothing)'} nudge on ${cueSeen.frames} frames`);

  // ---------------------------------------------------------------- assertions
  const worst = [r1, r2, r3].filter(Boolean).reduce((a, b) => (b.deficit > a.deficit ? b : a), r3 ?? r1);
  if (!worst) { skip('an ordinary navigation mistake stays legible', 'no run produced samples'); return; }

  // 1. THE HEADLINE, and it is measured against the player's own eye rather than in absolute
  //    terms — see `__eyeLegibility`. What the critic hit was not "I could see a wall", it was
  //    "I re-aimed at somewhere I could see and the camera still showed me plaster".
  // `rc` is deliberately excluded: it is not an ordinary walk, it is a teleport to the tightest
  // camera in the house followed by holding W into it, staged to exercise the cue. It is
  // reported above on its own line and asserted separately below.
  const blindWalk = [r1, r2, r3].filter(Boolean).reduce((a, b) => a + b.blindFrames, 0);
  if (blindWalk > 6) {
    fail('an ordinary navigation mistake stays legible',
      `${blindWalk} frames of ordinary walking were BLIND — camera median depth <= ${BLIND_MED} m while the`
      + ` player's own eye saw >= ${EYE_OK} m. Worst: camera median ${worst.medDepth} m against the eye's`
      + ` ${worst.eyeMed} m, boom ${worst.boom} m`);
  } else {
    pass('an ordinary navigation mistake stays legible',
      `${blindWalk} blind frames over four driven walks; the worst frame threw away ${worst.deficit} m`
      + ` (camera median ${worst.medDepth} m against the eye's ${worst.eyeMed} m) at boom ${worst.boom} m, tight ${worst.tight}`);
  }

  // 2. THE TRADE-OFF THE SOURCE ALREADY RULED ON. Whatever buys legibility must not buy it by
  //    putting the camera in the wall — that is the 1.55 m floor this file's header rejects,
  //    and it renders a black slab.
  const deepest = [r1, r2, r3].filter(Boolean).reduce((a, b) => (b.inside > a.inside ? b : a));
  if (deepest.inside > 0.05) {
    fail('the boom still never penetrates',
      `the camera ended up ${deepest.inside} m inside solid geometry — the 1.55 m-floor failure mode,`
      + ' which renders a black slab (see progress/playtest/game.play.c-divider-min155.png)');
  } else {
    pass('the boom still never penetrates', `worst camera penetration ${deepest.inside} m`);
  }

  // 3. NOWHERE IN THE HOUSE, not just nowhere on three walks — and judged against the player's
  //    own eye, so "you walked into a wall and are looking at it" is not counted as a defect.
  //
  // ⚠️ THE BAR IS 1%, NOT ZERO, AND THAT IS AN HONEST LIMIT RATHER THAN A WEAKENED TEST.
  // The residue is the sharpest inside corner of the NARROWEST room, faced diagonally: the
  // shoulder swing is supposed to slide the body out of frame, and in a corner there is nowhere
  // for it to go — moving along the shoulder axis there reduces the clearance behind as well.
  // Driving it to zero means either the 1.55 m boom floor this file's header measured and
  // rejected, or a level with camera clearance in it. Those spots are named below and the cue
  // fires at the worst of them, which is the whole reason the cue exists.
  for (const b of bad) {
    note(`  BLIND residue: (${b.x}, ${b.z}) yaw ${b.yaw} — camera median ${b.medDepth} m vs eye ${b.eyeMed} m,`
      + ` boom ${b.boom} m, tight ${b.tight}`);
  }
  if (bad.length > survey.length * 0.01) {
    fail('no hazard spot in the house blinds the camera',
      `${bad.length} of ${survey.length} camera solves have a median depth <= ${BLIND_MED} m while the player's own`
      + ` eye saw >= ${EYE_OK} m; worst (${sWorst.x}, ${sWorst.z}) yaw ${sWorst.yaw}: camera median ${sWorst.medDepth} m`
      + ` against the eye's ${sWorst.eyeMed} m`);
  } else {
    pass('no hazard spot in the house blinds the camera',
      `${bad.length} of ${survey.length} solves blind (bar: 1%) over every jamb, corner, pier and passage wall;`
      + ` the worst frame throws away ${sWorst.deficit} m (camera median ${sWorst.medDepth} m vs the eye's ${sWorst.eyeMed} m)`);
  }

  // 3c. THE SUITE PROVES ITSELF, IN THE SAME SESSION. `BREAK=old` is still the belt-and-braces
  //     revert, but a suite whose only validation lives in an env var nobody runs is a suite
  //     that has only ever been run against working code. The ablation above reverts the fix
  //     inside the measurement, so every green run of this file also carries the red one.
  const pre = abl[0], shipped = abl[abl.length - 1];
  if (pre.blind > shipped.blind * 4 && pre.pen > 0 && shipped.pen === 0) {
    pass('the instrument detects the defect it was written for',
      `reverting all three clamps in-session takes the same 488 solves from ${shipped.blind} blind /`
      + ` ${shipped.pen} in-geometry to ${pre.blind} blind / ${pre.pen} in-geometry`);
  } else {
    fail('the instrument detects the defect it was written for',
      `the pre-fix configuration measured ${pre.blind} blind / ${pre.pen} in-geometry against the shipped`
      + ` ${shipped.blind} / ${shipped.pen} — this survey cannot see the bug it exists to catch`);
  }
  // 3b. And the penetration invariant over the whole survey, not only the three walks.
  if (pen.length) {
    fail('the boom never penetrates, anywhere in the house',
      `${pen.length} of ${survey.length} solves put the camera >0.05 m inside solid geometry`);
  } else pass('the boom never penetrates, anywhere in the house', `0 of ${survey.length} solves`);

  // 4. THE CUE. Legibility alone does not tell the player WHICH WAY to turn, and the critic
  //    measured that re-aiming at the goal does not free you. Holding the tightest spot in the
  //    house must raise a cue, and it must reach the HUD — a latch that fires into a callback
  //    nobody wired is exactly the class of "it works in the model" this project keeps hitting.
  if (cueSeen.fired > 0 && cueSeen.turn) {
    pass('the wedge raises a cue that reaches the HUD',
      `held W into the house's tightest camera (${sTight.x}, ${sTight.z}); the cue fired ${cueSeen.fired}x`
      + ` and the HUD carried a TURN ${cueSeen.turn.toUpperCase()} nudge for ${cueSeen.frames} frames`);
  } else if (cueSeen.fired > 0) {
    fail('the wedge raises a cue that reaches the HUD',
      `ThirdPersonCamera fired the cue ${cueSeen.fired}x but nothing is on screen — the callback is not wired`);
  } else {
    fail('the wedge raises a cue that reaches the HUD',
      `the player was pinned at tight ${rc ? rc.tight : '?'} for seconds and nothing on screen said which way to turn`);
  }
}
