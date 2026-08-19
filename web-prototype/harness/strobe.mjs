#!/usr/bin/env node
/**
 * STROBE — judge MOTION, not a pose. Three sheets, one browser session, one read.
 *
 * ===========================================================================================
 * WHAT THIS IS FOR
 * ===========================================================================================
 *
 * You cannot judge motion against a still image, and every reference this project owns is a
 * still. `refs/dig/` shows robots HOLDING hammers in frozen poses — that is a bar for a pose.
 * It says nothing about acceleration, sequencing, weight or recovery. That gap is why a
 * one-handed sledgehammer swing shipped for a whole round and no instrument caught it: the
 * whole critique apparatus is built for photographs and was pointed at a photograph.
 *
 * This tool renders a motion as a labelled contact sheet, so a critic reads ONE image and sees
 * the whole arc. That economy is not a nicety — an image costs ~(w*h)/750 tokens, so a 1080p
 * frame is ~2,800 and fourteen of them is 39k. One sheet is ~2,800. `sheet.mjs` exists for
 * exactly this reason and this tool composes it rather than reimplementing it.
 *
 *   1. THE STROBE SHEET       one motion, N phases, tiled and labelled
 *   2. THE SILHOUETTE TEST    the same frames as flat black on a light ground
 *   3. THE IMPACT STROBE      densely sampled around the contact frame, so the swing, the
 *                             wall's response and the debris appear in ONE sheet together
 *
 * ===========================================================================================
 * WHAT IT CANNOT TELL YOU — read this before filing a verdict from one of these sheets
 * ===========================================================================================
 *
 *  - IT CANNOT TELL YOU ABOUT TIMING YOU DID NOT SAMPLE. A sheet is N discrete instants. A
 *    hitch, a pop, a one-frame interpenetration or a snap between two sampled phases is
 *    invisible here, and the sheet will look completely clean. If you suspect a discontinuity,
 *    raise `--n` around the region — do not conclude from a 10-tile sheet that nothing happened
 *    between tile 4 and tile 5.
 *  - IT CANNOT TELL YOU ABOUT SPEED. Tiles are evenly spaced in PHASE (or in time, for
 *    `--mode impact`), not in perceived pace. Two motions with wildly different ease curves
 *    produce similar-looking sheets. The tile labels carry the real numbers; read them.
 *  - IT IS ONE CAMERA. A swing that reads as weightless from the side can read fine from
 *    behind. One run is one angle; `critic-swing-1` shot five and that was the right instinct.
 *  - THE SILHOUETTE HIDES THE ARCHITECTURE (`--scope figure`), so it cannot tell you anything
 *    about the WALL — including whether the hole reads. That is deliberate: from inside a
 *    corridor the wall fills the frame and there is no ground for a silhouette to exist
 *    against. Judge the hole in the normal sheet.
 *  - THE SILHOUETTE FLATTENS EVERYTHING, INCLUDING THINGS YOU WANTED SOFT. `scene.overrideMaterial`
 *    replaces every material, so alpha-blended dust billboards become solid black cards. That
 *    is a known artefact of the mechanism, not a defect in the dust. Judge the FIGURE in the
 *    silhouette sheet and judge the dust in the normal sheet.
 *  - THE STAGING IS NOT THE SHIPPED LOOK. By default the exposure is lifted to 2.6 and the
 *    hunter is parked off-map, because most stations here measure luminance 7-13 and a shape
 *    you cannot see is not a shape you can judge. Never quote a grade or a lighting verdict
 *    off a strobe sheet. `--no-stage` gives you the shipped grade back.
 *  - A SILHOUETTE THAT READS BADLY IS NOT AUTOMATICALLY A BAD ANIMATION — it may be a bad
 *    camera. Check the normal sheet at the same tile index before blaming the motion.
 *  - IT DOES NOT SCORE ANYTHING. It produces evidence. The verdict is yours.
 *
 * ===========================================================================================
 * THE TWO THINGS THAT MAKE IT TRUSTWORTHY
 * ===========================================================================================
 *
 * 1. IT SAMPLES IN PHASE, NOT IN WALL CLOCK — because the engine clamps dt and a
 *    `waitForTimeout` is NOT "advance N frames". Every previous ad-hoc strobe in this project
 *    polled `page.evaluate` on a `waitForTimeout(60)` cadence and got whatever frames the GPU
 *    happened to deliver. This tool STOPS the live rAF loop and pumps `engine._step(1/60)` one
 *    frame at a time from Node, reading the motion's OWN phase variable after each step and
 *    capturing the first frame that crosses each target. So a tile labelled `p0.60` is the
 *    frame at phase 0.60, on any machine, under any GPU load.
 *
 *    Between steps nothing advances at all, so a screenshot is a picture of exactly the frame
 *    the label names. (This is the same class of bug `src/core/engine.js`'s header describes
 *    for capture mode: 790 frames once elapsed inside a single `page.screenshot()` call.)
 *
 * 2. IT VERIFIES ITS OWN OUTPUT AND WILL CALL ITSELF A FAILURE. After writing the tiles it
 *    decodes every PNG and checks that (a) no tile is blank or uniform, and (b) consecutive
 *    tiles actually DIFFER — because a strobe whose pump silently did nothing produces N
 *    identical frames tiled into a sheet that looks entirely plausible. For `--silhouette` it
 *    additionally checks the histogram is bimodal (ink + ground), since a silhouette that
 *    quietly failed renders as a normal frame and still looks like a picture.
 *    ⚠️ These checks report SKIP or FAIL. They never report PASS on something they could not
 *    read. Six instruments in this project's history "worked" and produced nothing.
 *
 * ===========================================================================================
 * USE
 * ===========================================================================================
 *
 *   node harness/strobe.mjs --motion sledge                      the swing, 10 phases, side-on
 *   node harness/strobe.mjs --motion sledge --silhouette         + the flat-black sheet
 *   node harness/strobe.mjs --motion sledge --mode impact        the contact window
 *   node harness/strobe.mjs --motion sledge --cam play           what a player actually sees
 *
 *   --motion <name>   sledge | club          (MOTIONS below; add one there, not in a new file)
 *   --mode <m>        uniform | impact       default uniform
 *   --n <n>           tiles                  default 10 uniform / 14 impact
 *   --silhouette      also write the flat-black sheet of the SAME frames
 *   --cam <m>         profile | play         default profile — a hand-placed SIDE-ON camera
 *                     with a clearance probe. `play` leaves the shipped third-person boom
 *                     alone, which is honest about what a player sees and useless for judging
 *                     a swing (see below).
 *   --scope <s>       figure | subject | all   what the silhouette treats as GROUND, default
 *                     figure (hide the architecture, keep robot + hammer + debris + dust)
 *   --dist <m>        profile camera distance   default 3.0 (clamped by the clearance probe)
 *   --camh <m>        profile camera height     default 1.05
 *   --lookh <m>       aim point above the floor default 0.95
 *   --fov <deg>       override the camera fov (tighter framing without moving closer)
 *   --no-stage        do NOT lift the exposure. Judge the shipped grade instead of the shape.
 *   --exposure <n>    staging exposure          default 2.6
 *   --prehits <n>     land n blows first, so the strobed blow is not the first one on a
 *                     pristine wall. Reported in the output; it is staging, so it is stated.
 *   --before <s>      impact mode: seconds before contact   default 0.15
 *   --after <s>       impact mode: seconds after contact    default 0.40
 *   --hud 0           hide the DOM HUD on the normal sheet too (it is always hidden on the
 *                     silhouette, where it would sit on top of the shapes)
 *   --out <dir>       default progress/strobe
 *   --port <n>        default 5194  (5178 is shoot.mjs, 5191 playtest.mjs, 5193 is a frozen
 *                     snapshot build that has contaminated a perf round — never reuse it)
 *   --q <qs>          extra query string, default "seed=s4"
 *   --view <id>       default game.play
 *   --keep-tiles      do not delete the individual frames after tiling
 *
 * ⚠️ WHY SIDE-ON IS THE DEFAULT AND `--cam play` IS NOT. `game.play`'s third-person boom sits
 * behind the robot. A sledgehammer swing travels forward and DOWN, so from behind the hammer
 * is visible for the wind-up and then disappears behind the robot's own torso for the whole
 * second half — the tool would be strobing the half of the motion the camera cannot see. The
 * first sheet this tool produced did exactly that. Judge a swing from the side; use `--cam
 * play` only to ask the different question of what the player is actually shown.
 *
 * ===========================================================================================
 * FOR A CRITIC WRITING THEIR OWN SCENARIO
 * ===========================================================================================
 *
 * Import it. Do not write a seventh throwaway strobe — six accumulated before consolidation.
 *
 *   import { strobe, composeSheets } from '../strobe.mjs';
 *   export default async function myScenario(ctx) {
 *     const m = await strobe(ctx, {
 *       name: 'my-motion',
 *       setup: async ({ page }) => page.evaluate(() => { ... arm the world ... }),
 *       fire:  async ({ page }) => page.evaluate(() => { ... start the motion ... }),
 *       phase: '() => window.__rrr.engine.player.sledge.phase || null',
 *       mode: 'uniform', n: 10, silhouette: true,
 *     });
 *     await composeSheets(m);
 *   }
 *
 * `phase` is a STRING of an arrow function evaluated in the page. It must return the motion's
 * own 0..1 parameter while the motion runs and a falsy value when it does not. Reading the
 * animation's own clock is the entire point: it is the only signal that stays correct when
 * the duration constant changes.
 *
 * ===========================================================================================
 * TILE NUMBERING — the one place a critic has previously misread a strobe
 * ===========================================================================================
 *
 * `sheet.mjs` numbers tiles `1.`, `2.`, `3.` … but `char.locomotion`'s older strobe built
 * `phase: i/n` for `i = 0..5`, so its FIRST panel was phase 0 and a critic counting 1-based
 * reported every phase one panel late (`docs/sealed/loco-ab4-key.md`). This tool removes the
 * ambiguity by writing the phase INTO EACH FILENAME, which is what `sheet.mjs` prints as the
 * caption. Read the label, never the position.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toDataURL, openCanvasPage } from './imglib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 60;

// ============================================================================ motions
//
// A motion is: how to arm the world, how to start it, and where its own clock lives.
// ADD MOTIONS HERE. A new file per motion is how this project ended up with six abandoned
// strobes; the whole reason this one exists is to be the place they go instead.
//
// `setup` and `fire` are strings evaluated in the page, not node closures, so a motion is
// data and can be logged, diffed and quoted in a report.

/**
 * Arm the sledgehammer and stand the player at a wall.
 *
 * ⚠️ THE TWO BUGS THIS INHERITED, BOTH ALREADY PAID FOR ONCE EACH:
 *   - TAKE THE WORLD PROP BY IDENTITY (`type === 'sledge'`), never "first item in the field".
 *     `sledge-check.mjs` and `swing-weight.mjs` both grabbed a nailgun or a ball that way and
 *     reported a real pickup of the wrong object.
 *   - `aimYaw` DOES NOT STICK. `views/game.js` recomputes it from `cam.yaw` every frame, so
 *     setting only `p.aimYaw` is overwritten by the very next step and the swing lands
 *     somewhere else entirely. Drive `e.cam.yaw` too. That cost a whole diagnostic round.
 */
const SETUP_SLEDGE = `() => {
  const e = window.__rrr.engine, p = e.player, room = e.room;
  for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'gadget') p.rig.detach(s);
  for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
  if (p.rig.held) p.rig.dropHeld();

  if (!p.sledge.owned) {
    const it = e.limbField.items.find((i) => i.type === 'sledge');
    if (!it) return { ok: false, why: 'no LimbItem with type "sledge" in limbField.items' };
    p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
    p.interact(e.limbField, 1.5, null);
  }
  if (!p.sledge.equipped) p.sledge.equip();
  if (!p.sledge.equipped) return { ok: false, why: 'the hammer would not equip (arms: ' + p.caps.arms + ')' };

  // Find a damageable panel to face. Six anchors x 24 headings.
  //
  // NEAREST-WINS WAS THE WRONG TIEBREAK AND IT PRODUCED UNREPRESENTATIVE SHEETS. Three ways:
  //   1. It could pick a CHAINED CONNECTOR or any incidental damageable geometry rather than a
  //      dig panel, so the sheet judged the hammer against a surface the dig does not use.
  //   2. It could pick a panel ALREADY DUG INTO. A half-excavated face throws different debris
  //      and a different break edge, so the impact strobe stops being a picture of a first blow.
  //   3. Nearest is actively bad for framing: it parks the robot nose-to-wall, where the sheet
  //      is all plaster and the swing has no room. The hammer needs standoff to read at all.
  // So: hard-reject 1 and 2, and score on FRAMING inside a standoff band instead of on distance.
  const anchors = ['study_w.north', 'gallery.mid', 'gallery.west', 'ballroom.centre', 'chapel.centre', 'service.mid'];
  const NEAR = 1.20, FAR = 2.50, IDEAL = 1.75;
  let best = null, rejected = { notDig: 0, alreadyDug: 0, tooClose: 0 };
  for (const name of anchors) {
    const v = room.anchor?.(name);
    if (!v) continue;
    const from = v.clone(); from.y += p.eyeHeight;
    for (let i = 0; i < 24; i++) {
      const yaw = (i / 24) * Math.PI * 2;
      const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
      const hit = room.castRay?.(from, dir, FAR, { forDamage: true });
      if (!hit?.panel) continue;
      if (!hit.panel.spec?.dig) { rejected.notDig++; continue; }
      const dug = hit.panel.field?.maxDepth ?? 0;
      if (dug > 0.01) { rejected.alreadyDug++; continue; }
      if (hit.distance < NEAR) { rejected.tooClose++; continue; }
      // Closest to the ideal standoff wins, not closest to the wall.
      const score = Math.abs(hit.distance - IDEAL);
      if (!best || score < best.score) best = { name, v, yaw, distance: hit.distance, score, id: hit.panel.id ?? null };
    }
  }
  // DEGRADE, LABELLED, RATHER THAN DIE. A sheet shot against a compromised anchor is still worth
  // having as long as nobody can mistake it for a clean one — so if the strict pass finds nothing,
  // fall back to the old nearest-damageable rule and set the degraded field, which the caller
  // prints. (No backticks in this comment: the whole function is a template literal, and quoting
  // an identifier here terminates the string. That trap has broken this project seven times.)
  let degraded = null;
  if (!best) {
    for (const name of anchors) {
      const v = room.anchor?.(name);
      if (!v) continue;
      const from = v.clone(); from.y += p.eyeHeight;
      for (let i = 0; i < 24; i++) {
        const yaw = (i / 24) * Math.PI * 2;
        const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
        const hit = room.castRay?.(from, dir, FAR, { forDamage: true });
        if (hit?.panel && (!best || hit.distance < best.distance)) {
          best = { name, v, yaw, distance: hit.distance, score: 0, id: hit.panel.id ?? null };
        }
      }
    }
    if (best) {
      degraded = 'NO FRESH DIG PANEL AT A WORKABLE STANDOFF — fell back to nearest damageable surface.'
        + ' This sheet may show a non-dig surface, an already-excavated face, or a nose-to-wall pose.'
        + ' Rejected: ' + rejected.notDig + ' not-a-dig-panel, ' + rejected.alreadyDug + ' already dug, '
        + rejected.tooClose + ' too close to swing at.';
    }
  }
  if (!best) {
    return { ok: false, why: 'no damageable panel within ' + FAR + ' m of any of the six anchors'
      + ' (rejected by the strict pass: ' + rejected.notDig + ' not-a-dig-panel, ' + rejected.alreadyDug
      + ' already dug, ' + rejected.tooClose + ' too close to swing at)' };
  }
  p.pos.copy(best.v); p.vel.set(0, 0, 0);
  p.aimYaw = best.yaw; p.facing = best.yaw;
  if (e.cam) e.cam.yaw = best.yaw;          // <- the half that actually sticks
  p._fireCd = 0;
  // The panel id is reported so a critic can say WHICH wall it judged. A sheet that does not name its
  // subject has been mistaken for a house-wide verdict twice on this project.
  return { ok: true, anchor: best.name, panel: best.id, yaw: +best.yaw.toFixed(3),
           wallAt: +best.distance.toFixed(2), rejected, degraded,
           equipped: p.sledge.equipped, owned: p.sledge.owned };
}`;

/**
 * Arm the detached-limb club. Same world, different weapon — kept so the impact strobe can be
 * pointed at the thing `swing-weight.mjs` gates, and so "the club is untouched by sledge work"
 * is a claim somebody can actually LOOK at rather than infer from a scalar.
 *
 * ⚠️ Takes the detached leg BY IDENTITY, which is `swing-weight.mjs`'s own hard-won fix.
 */
const SETUP_CLUB = `() => {
  const e = window.__rrr.engine, p = e.player;
  if (p.sledge.equipped) p._toggleSledge();
  if (p.rig.occupant('hipR') === 'empty') p.rig.refit?.('hipR');
  const leg = p.rig.detach('hipR');
  if (!leg) return { ok: false, why: 'nothing detached from hipR' };
  leg.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  const got = p.rig.pickUp(leg);
  p._fireCd = 0;
  return { ok: !!p.rig.held, picked: !!got, held: p.rig.held?.label ?? null,
           why: p.rig.held ? null : 'pickUp() left rig.held null' };
}`;

/**
 * STAGE THE SHOT. Everything in here is `critic-swing-1`'s, and it was right about all of it.
 *
 * That agent hand-rolled a strobe (`harness/scenarios/swing-strobe.mjs`) before this tool
 * existed and stopped without filing. Its SAMPLING is superseded — it fired one swing per
 * checkpoint and polled `waitForTimeout`, because under GPU contention a 38 ms requested gap
 * really landed at 440-500 ms and 27 of its first 30 frames arrived after the 0.70 s swing had
 * already ended. The frame pump above removes that problem at the root: one swing, one
 * continuous session, the clock in Node's hand.
 *
 * But its STAGING is better than what this tool shipped first, and all three parts are kept:
 *
 *  1. PARK THE HUNTER. An idle hunter 10-17 s into a session put hip and spine roll spikes into
 *     what was meant to be a swing-only trace. A strobe of a swing must contain only the swing.
 *  2. PROBE FOR CAMERA CLEARANCE BEFORE PLACING THE CAMERA — and the reasoning is the part
 *     worth carrying: the production `ThirdPersonCamera` clamps its own boom off a `castRay`
 *     EVERY FRAME (`clearAt()` in player.js), so it never ends up inside geometry. A hand-placed
 *     camera skips that check and drives straight through the wall. `ballroom.centre` put a
 *     load-bearing column through the middle of two of its frames that way.
 *  3. LIFT THE EXPOSURE. Most stations in this game measure luminance 7-13. The shipped grade
 *     is right for play and wrong for judging a shape, so the strobe grades for legibility and
 *     says so — `--no-stage` turns it off when you want to judge the shipped look instead.
 *
 * ⚠️ ITS SILHOUETTE, BY CONTRAST, IS DELIBERATELY NOT ADOPTED. `harness/_tmp_swing_silhouette.mjs`
 * thresholds the finished PNG at luminance > 150. On stations that sit at 7-13 that is a coin
 * toss dressed as a measurement, and it is exactly why the exposure had to be pushed to 2.6
 * before it could work at all. `scene.overrideMaterial` separates figure from ground in the
 * renderer, where the information actually is.
 *
 * THE CAMERA IS SIDE-ON BY DEFAULT AND THAT IS NOT A PREFERENCE. Shot from behind — which is
 * what `game.play`'s own third-person boom gives you — the hammer is visible for the wind-up
 * and then vanishes behind the robot's own torso for the entire second half of the swing,
 * because the swing travels forward and down. The half of the motion that carries the weight
 * is the half the default camera cannot see.
 */
const stageSrc = (o) => `() => {
  const e = window.__rrr.engine, p = e.player, room = e.room;
  const out = { cam: '${o.cam}' };

  if (e.hunter?.root) {
    const park = () => { e.hunter.root.position.set(9999, 0, 9999); e.hunter.vel?.set?.(0, 0, 0); };
    park(); e.onUpdate(park); out.hunterParked = true;
  }

  if (${o.stageLight ? 'true' : 'false'}) {
    window.__rrr.setGrade({ exposure: ${o.exposure}, vignette: 0.04, haze: 0.0, toeCrush: 0.0, contrast: 1.0, ca: 0.0 });
    out.graded = ${o.exposure};
  }

  if ('${o.cam}' === 'profile') {
    const facing = p.facing;
    // right-hand vector for this facing; forward is (sin F, 0, cos F) everywhere in this repo
    const want = ${o.dist}, camH = ${o.camH};
    const cands = [];
    for (const s of [1, -1]) {
      const dir = p.pos.clone().set(Math.cos(facing) * s, 0, -Math.sin(facing) * s);
      const from = p.pos.clone(); from.y = camH;
      const hit = room.castRay?.(from, dir, want + 1.0);
      const clear = hit && hit.distance < want + 1.0 ? hit.distance : want + 1.0;
      cands.push({ s, clear: +clear.toFixed(2) });
    }
    const best = cands[0].clear >= cands[1].clear ? cands[0] : cands[1];
    const dist = Math.max(${o.camMin}, Math.min(want, best.clear - 0.45));
    const rx = Math.cos(facing) * best.s, rz = -Math.sin(facing) * best.s;
    // Freeze the production rig. It would otherwise re-solve the boom back to behind the
    // player on the very next step and quietly undo all of this.
    if (e.cam) e.cam.update = () => {};
    // AIM BETWEEN THE ROBOT AND THE WALL, not at the robot. The blow lands at the wall, so a
    // camera centred on the body pushes the contact — the thing the impact strobe exists to
    // show — out to the edge of frame. Re-probed here rather than passed in, so the framing
    // cannot drift out of sync with where the player was actually placed.
    const fwd = p.pos.clone().set(Math.sin(facing), 0, Math.cos(facing));
    const eye = p.pos.clone(); eye.y += p.eyeHeight;
    const wallHit = room.castRay?.(eye, fwd, 3.0, { forDamage: true });
    const lead = wallHit ? Math.min(1.0, wallHit.distance * 0.5) : 0.0;
    out.wallAt = wallHit ? +wallHit.distance.toFixed(2) : null;
    e.camera.position.set(p.pos.x + rx * dist + fwd.x * lead, camH, p.pos.z + rz * dist + fwd.z * lead);
    e.camera.lookAt(p.pos.x + fwd.x * lead, p.pos.y + ${o.lookH}, p.pos.z + fwd.z * lead);
    if (${o.fov ? 'true' : 'false'}) { e.camera.fov = ${o.fov || 0}; }
    e.camera.updateProjectionMatrix();
    e.camera.updateMatrixWorld(true);
    out.side = best.s > 0 ? 'right' : 'left';
    out.clearance = cands.map((c) => c.clear);
    out.dist = +dist.toFixed(2);
    out.lead = +lead.toFixed(2);
    out.fov = +e.camera.fov.toFixed(1);

    // Diagnostic for the one artefact the silhouette still shows: a warm glow near the floor
    // props that survives scene.overrideMaterial. Anything with its own render hook can draw
    // outside the override, so name them rather than guess.
    // (three's own defaults are empty functions, so a long body means somebody installed one)
    const hooks = [];
    e.scene.traverse((ob) => {
      if (!ob.visible) return;
      const a = String(ob.onBeforeRender || ''), b = String(ob.onAfterRender || '');
      if (a.length > 24 || b.length > 24) hooks.push((ob.name || ob.type) + (ob.isSprite ? ':sprite' : ''));
    });
    out.renderHooks = hooks.slice(0, 8);
    out.spriteCount = (() => { let k = 0; e.scene.traverse((ob) => { if (ob.isSprite && ob.visible) k++; }); return k; })();
    if (dist < want) out.note = 'boom shortened by geometry — the clearance probe is why this is not inside a wall';
  }
  return out;
}`;

const FIRE_ATTACK = `() => {
  const e = window.__rrr.engine, p = e.player;
  p._fireCd = 0;
  const r = p.attack(e.elapsed);
  return { fired: !!r, weapon: r?.weapon ?? null, denied: r?.denied ?? null, at: +e.elapsed.toFixed(4) };
}`;

export const MOTIONS = {
  sledge: {
    label: 'sledgehammer swing',
    setup: SETUP_SLEDGE,
    fire: FIRE_ATTACK,
    // The rig's own clock. `SledgeRig.phase` is 0 whenever no swing is running, so the
    // falsy-when-idle contract the sampler needs holds without a second flag.
    phase: `() => { const p = window.__rrr.engine.player; return p.sledge.phase || null; }`,
    // Contact is a property of the animation, not of this tool: SWING_DUR 0.70 s,
    // CONTACT_PHASE 0.60 (src/game/sledge.js). Predicted here and VERIFIED against the
    // latch below, so a change to either constant shows up as a mismatch rather than as a
    // sheet whose labels are quietly wrong.
    anchorAt: 0.70 * 0.60,
    anchor: `() => window.__rrr.engine.player.sledge._fired === true`,
    // What the blow actually did, read once after the run. This is the line that says whether
    // the impact sheet is a picture of an impact at all.
    outcome: `() => {
      const e = window.__rrr.engine, p = e.player, h = p._lastSledgeHit;
      // Re-cast the aim ray to read the panel's CURRENT stage. \`res\` is what one blow
      // returned; the stage is whether the wall actually moved, and they are not the same
      // question — a blow can report damage every time against a stage that never changes.
      let stage = null;
      try {
        const eye = p.pos.clone(); eye.y += p.eyeHeight;
        const fwd = p.pos.clone().set(Math.sin(p.facing), 0, Math.cos(p.facing));
        const hit = e.room.castRay?.(eye, fwd, 3.0, { forDamage: true });
        if (hit?.panel) stage = hit.panel.stage ?? null;
      } catch (err) { stage = 'unreadable'; }
      return h ? { hadPanel: !!h.hadPanel, res: h.res ?? null, panelStage: stage }
               : { hadPanel: false, res: null, panelStage: stage };
    }`,
  },
  club: {
    label: 'detached-limb club swing',
    setup: SETUP_CLUB,
    fire: FIRE_ATTACK,
    phase: `() => { const p = window.__rrr.engine.player; return p.rig.swinging ? (p.rig._swingPhase || 0.0001) : null; }`,
    // The club's contact phase is 0.42 in `player.js`'s strike-impulse gate; its duration is
    // not exported, so impact mode on the club is scheduled from a measured first run rather
    // than from a constant. Uniform mode needs neither and is the mode to prefer here.
    anchorAt: null,
    anchor: `() => window.__rrr.engine.player._swingKicked === true`,
    outcome: `() => null`,
  },
};

// ============================================================================ the sampler

/**
 * Stop the live loop and hand Node the clock.
 *
 * `_liveLoop`'s tick re-registers itself at the TOP of each callback, so cancelling the one
 * pending frame stops the chain for good. From then on the ONLY thing that advances the world
 * is `__strobe.step()`, which runs `_step(1/60)` inside a real `requestAnimationFrame` — so
 * the draw happens exactly where a normal frame's draw happens and the compositor has a frame
 * to show. Doing the render outside rAF is how you get a blank PNG that still has a file size.
 */
const PUMP_SRC = `() => {
  const e = window.__rrr.engine;
  if (window.__strobe) return { already: true, frame: e.frame };
  if (e._raf) cancelAnimationFrame(e._raf);
  e._raf = 0;
  window.__strobe = {
    step: (n = 1) => new Promise((res) => {
      const go = () => requestAnimationFrame(() => {
        e._step(1 / 60, performance.now());
        if (--n > 0) go(); else res(e.frame);
      });
      go();
    }),
    /**
     * ⚠️ THE OVERRIDE MATERIAL ALONE DOES NOT PRODUCE A SILHOUETTE INDOORS, AND THE FIRST
     * VERSION OF THIS TOOL SHIPPED A SHEET THAT PROVED IT. Standing 1.67 m from a wall in a
     * corridor, EVERY pixel of the frame is geometry — so painting all geometry black gives a
     * 99% black rectangle with no ground behind anything. The histogram check even passed it
     * (98.9% of pixels were "ink"); only opening the image caught it.
     *
     * So the scope decides what counts as GROUND:
     *   figure  (default) hide the architecture (room.root). The robot, the hammer, the
     *           debris and the dust stay black against the clear colour. This is the one that
     *           serves the impact strobe, because the debris survives it.
     *   subject strictest: keep ONLY the player's own subtree. The classical animation
     *           silhouette test — nothing but the character can explain the read.
     *   all     hide nothing. Only meaningful where there is real sky behind the subject.
     */
    sil: (on, scope) => new Promise((res) => {
      const e = window.__rrr.engine;
      if (on) {
        const hidden = [];
        if (scope === 'subject') {
          const keep = e.player?.root ?? null;
          e.scene.traverse((o) => {
            if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return;
            let n = o, inside = false;
            while (n) { if (n === keep) { inside = true; break; } n = n.parent; }
            if (!inside && o.visible) { hidden.push(o); o.visible = false; }
          });
        } else if (scope !== 'all') {
          const root = e.room?.root ?? null;
          if (root && root.visible) { hidden.push(root); root.visible = false; }
        }
        window.__strobeHidden = hidden;
        window.__rrr.silhouette(true);
      } else {
        window.__rrr.silhouette(false);
        for (const o of window.__strobeHidden || []) o.visible = true;
        window.__strobeHidden = null;
      }
      requestAnimationFrame(() => { window.__rrr.redraw(!!on); res(true); });
    }),
    scopeInfo: (scope) => {
      const e = window.__rrr.engine;
      return { scope, hasRoom: !!e.room?.root, hasPlayer: !!e.player?.root };
    },
    chrome: (vis) => {
      for (const el of Array.from(document.body.children)) {
        if (el.id === 'rrr-canvas') continue;
        if (vis) el.style.visibility = el.dataset.strobePrev || '';
        // guard: hiding twice would record 'hidden' as the value to restore later
        else if (el.style.visibility !== 'hidden') { el.dataset.strobePrev = el.style.visibility; el.style.visibility = 'hidden'; }
      }
    },
  };
  return { already: false, frame: e.frame };
}`;

// ⚠️ IMMEDIATELY INVOKED, and the parentheses are load-bearing. `page.evaluate(string)`
// evaluates the string as an EXPRESSION — hand it `(() => {...})` and the result is a function
// object, which is not serializable, so the call fails with an opaque error instead of running
// the motion. `(...)()` makes the value unambiguous in both Playwright's string and function
// paths. No arguments are passed by design: a motion is a self-contained page-side script.
const evalStr = (page, src) => page.evaluate(`(${src})()`);

/**
 * Drive one motion and capture N frames of it.
 *
 * Returns a manifest: { name, mode, dir, tiles: [{ file, silFile, phase, frame, t, label }],
 * setup, fire, anchor, notes }. `composeSheets(manifest)` turns it into the sheets.
 */
export async function strobe(ctx, spec) {
  const { page, snap, note, pass, fail, skip } = ctx;
  const name = spec.name ?? 'motion';
  const mode = spec.mode ?? 'uniform';
  const n = spec.n ?? (mode === 'impact' ? 14 : 10);
  const outDir = path.resolve(ROOT, spec.out ?? 'progress/strobe', name + '.' + mode);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const manifest = {
    name, mode, dir: outDir, label: spec.label ?? name, tiles: [],
    silhouette: !!spec.silhouette, notes: [], at: new Date().toISOString(),
  };
  const say = (l) => { manifest.notes.push(l); note(l); };

  // ---- take the clock ------------------------------------------------------------------
  const pump = await evalStr(page, PUMP_SRC).catch((e) => ({ err: String(e) }));
  if (pump?.err || pump == null) {
    skip(`strobe ${name}`, `could not install the frame pump: ${pump?.err ?? 'no engine'}`);
    return null;
  }
  say(`frame pump installed at engine frame ${pump.frame} — the live rAF loop is stopped, Node owns the clock`);

  const step = (k = 1) => page.evaluate((k) => window.__strobe.step(k), k);
  // Composed once, as source, so the motion's own phase getter is inlined rather than passed
  // as data and `eval`'d in the page (which a CSP would refuse, silently turning every phase
  // reading into null and every sheet into a uniform-in-wall-clock strobe wearing phase labels).
  const READ_SRC = `() => ({
    frame: window.__rrr.engine.frame,
    t: +window.__rrr.engine.elapsed.toFixed(4),
    phase: (${spec.phase})(),
    anchor: !!(${spec.anchor ?? '() => false'})(),
  })`;
  const read = () => evalStr(page, READ_SRC);

  // ---- arm the world -------------------------------------------------------------------
  const setup = await evalStr(page, spec.setup);
  manifest.setup = setup;
  say(`setup: ${JSON.stringify(setup)}`);
  if (!setup?.ok) {
    skip(`strobe ${name}`, `setup did not arm the motion: ${setup?.why ?? 'no reason given'}`);
    return null;
  }
  // A DEGRADED ANCHOR MUST BE IMPOSSIBLE TO MISS. The sheet still gets made — a compromised
  // picture beats none — but a critic reading it has to know it may not be a first blow on a
  // dig panel at a workable standoff. Buried in the JSON dump above, nobody would see it.
  if (setup.degraded) {
    console.log(`\n  ⚠️  DEGRADED ANCHOR — ${setup.degraded}\n      Judge this sheet's SUBJECT before judging its motion.\n`);
    manifest.degraded = setup.degraded;
  }
  // `player.facing` LERPS toward the yaw setup asked for, so the camera must not be placed
  // until it has arrived — a profile camera staged against a facing that is still turning is
  // a three-quarter camera by the time the swing starts.
  await step(spec.settleFrames ?? 20);

  // ---- stage the shot ------------------------------------------------------------------
  const stage = await evalStr(page, stageSrc({
    cam: spec.cam ?? 'profile',
    stageLight: spec.stageLight !== false,
    exposure: spec.exposure ?? 2.6,
    dist: spec.dist ?? 3.0,
    camMin: spec.camMin ?? 1.8,
    camH: spec.camH ?? 1.05,
    lookH: spec.lookH ?? 0.95,
    fov: spec.fov ?? 0,
  }));
  manifest.stage = stage;
  say(`stage: ${JSON.stringify(stage)}`);
  if ((spec.cam ?? 'profile') === 'profile' && !stage.side) {
    say('⚠️ the profile camera did not place — falling back to the shipped third-person boom, which HIDES THE SECOND HALF OF A SWING BEHIND THE ROBOT. Treat the sheet accordingly.');
  }
  await step(4);

  // ---- optional preparatory blows ------------------------------------------------------
  // ⚠️ A PREPARATORY BLOW THAT DID NOT LAND IS STAGING YOU CANNOT SEE. The first version of
  // this just fired n times and announced "n blows landed" — and on the very first run that
  // sentence was printed beside an unchanged wall (`removed 0.28, brokeThrough false` after
  // four blows, exactly as after one). Report what each blow actually did, and if the wall
  // state never moves, say THAT rather than repeating the intent.
  if (spec.prehits) {
    const hits = [];
    for (let i = 0; i < spec.prehits; i++) {
      const f = await evalStr(page, spec.fire);
      await step(Math.ceil((spec.anchorAt ?? 0.7) * FPS) + 30);
      const o = spec.outcome ? await evalStr(page, spec.outcome) : null;
      hits.push({ fired: !!f?.fired, ...(o ?? {}) });
    }
    manifest.prehits = { asked: spec.prehits, hits };
    say(`prehits: ${JSON.stringify(hits)}`);
    const landed = hits.filter((h) => h.hadPanel).length;
    const moved = new Set(hits.map((h) => JSON.stringify(h.res ?? null))).size > 1
      || hits.some((h) => h.res?.brokeThrough);
    if (!landed) {
      say(`⚠️ STAGING FAILED: ${spec.prehits} preparatory blow(s) were requested and NONE found a panel. The strobed blow is a first hit on a pristine wall, whatever the flag says.`);
    } else if (!moved) {
      say(`⚠️ STAGING DID NOT ACCUMULATE: ${landed}/${spec.prehits} preparatory blow(s) hit a panel, but every one returned the identical result and none broke through. Either the damage does not persist between blows or this stage needs more than ${spec.prehits + 1} hits — do NOT read this sheet as "a wall that has already been worked".`);
    } else {
      say(`⚠️ STAGED: ${landed}/${spec.prehits} preparatory blow(s) landed, so this is NOT a first hit on a pristine wall`);
    }
    await step(20);
  }

  // ---- schedule ------------------------------------------------------------------------
  // uniform: targets are PHASES, matched as the motion's own clock crosses them.
  // impact:  targets are FRAME OFFSETS from the predicted contact frame, because after the
  //          motion ends its phase is gone and the debris is still going. THAT IS THE WHOLE
  //          POINT OF THE MODE — the swing is 0.70 s and the debris lives 1.6-4.2 s, so an
  //          evenly spaced sample of the whole event serves neither.
  let phaseTargets = null, frameTargets = null, anchorFrame = null;
  if (mode === 'impact') {
    if (spec.anchorAt == null) {
      skip(`strobe ${name}`, 'impact mode needs anchorAt (the seconds from fire to contact) and this motion does not declare one');
      return null;
    }
    anchorFrame = Math.ceil(spec.anchorAt * FPS);
    const before = spec.before ?? 0.15, after = spec.after ?? 0.40;
    frameTargets = [];
    for (let i = 0; i < n; i++) {
      const off = -before + (i / (n - 1)) * (before + after);
      frameTargets.push({ i, off, frame: anchorFrame + Math.round(off * FPS) });
    }
    // two tiles landing on one frame is a silent duplicate; dedupe and say so
    const seen = new Set();
    const uniq = frameTargets.filter((t) => (seen.has(t.frame) ? false : (seen.add(t.frame), true)));
    if (uniq.length !== frameTargets.length) {
      say(`⚠️ ${frameTargets.length - uniq.length} requested tile(s) fell on a frame already sampled at 60 Hz — dropped rather than duplicated. Widen --before/--after or lower --n.`);
      frameTargets = uniq;
    }
    say(`impact window: contact predicted at frame +${anchorFrame} (${(spec.anchorAt * 1000).toFixed(0)} ms), sampling ${frameTargets.length} frames from ${(-before * 1000).toFixed(0)} to +${(after * 1000).toFixed(0)} ms`);
  } else {
    // ⚠️ `i / n`, NOT `i / (n-1)`, AND THAT IS NOT AN OFF-BY-ONE. A phase of exactly 1.0 is
    // never observable: `SledgeRig.update` resets `_phase = 0` and drops the swing the moment
    // it reaches 1, so the getter goes null and a target of 1.0 would wait forever and silently
    // drop the last tile. `i / n` spans 0 … (n-1)/n, every value of which the clock really
    // passes through. The recovery beyond the last target is covered by the extra `rest` tile
    // captured when the motion ends — recovery is one of the things a still cannot show, so it
    // gets its own frame rather than being trimmed off the end.
    phaseTargets = [];
    for (let i = 0; i < n; i++) phaseTargets.push(i / n);
    say(`uniform: ${n} tiles at phases ${phaseTargets.map((p) => p.toFixed(2)).join(' ')} (+1 rest tile) — sampled on the motion's own clock, not on wall time`);
  }

  // ---- capture -------------------------------------------------------------------------
  const capture = async (tile) => {
    const pad = String(manifest.tiles.length).padStart(2, '0');
    const file = path.join(outDir, `${pad}_${tile.label}.png`);
    await page.evaluate((v) => window.__strobe.chrome(v), spec.hud !== false);
    const ok = await snap(`${name}-${pad}`, { path: file });
    let silFile = null;
    if (spec.silhouette) {
      // The SAME frame, re-rendered flat. Nothing steps in between, so tile k of the two
      // sheets is provably the identical instant — two separate runs could not promise that.
      silFile = path.join(outDir, `sil-${pad}_${tile.label}.png`);
      await page.evaluate(() => window.__strobe.chrome(false));
      await page.evaluate((s) => window.__strobe.sil(true, s), spec.scope ?? 'figure');
      const sok = await snap(`${name}-sil-${pad}`, { path: silFile });
      await page.evaluate((s) => window.__strobe.sil(false, s), spec.scope ?? 'figure');
      if (!sok) silFile = null;
    }
    manifest.tiles.push({ ...tile, file: ok ? file : null, silFile });
    if (!ok) say(`⚠️ screenshot failed for tile ${pad} (${tile.label}) — the sheet will be short one frame`);
  };

  const fired = await evalStr(page, spec.fire);
  manifest.fire = fired;
  say(`fire: ${JSON.stringify(fired)}`);
  if (!fired?.fired) {
    skip(`strobe ${name}`, `the motion never started: ${fired?.denied ?? JSON.stringify(fired)}`);
    return null;
  }

  const track = [];
  let anchorSeenAt = null, ti = 0;
  const maxFrames = mode === 'impact'
    ? frameTargets[frameTargets.length - 1].frame + 2
    : Math.ceil((spec.maxSeconds ?? 3) * FPS);

  for (let f = 1; f <= maxFrames; f++) {
    await step(1);
    const s = await read();
    track.push({ f, phase: s.phase, t: s.t });
    if (s.anchor && anchorSeenAt == null) anchorSeenAt = f;

    if (mode === 'impact') {
      while (ti < frameTargets.length && frameTargets[ti].frame === f) {
        const ms = Math.round(frameTargets[ti].off * 1000);
        await capture({
          frame: f, t: s.t, phase: s.phase,
          off: frameTargets[ti].off,
          label: `${ms >= 0 ? '+' : ''}${ms}ms${s.phase ? `_p${s.phase.toFixed(2)}` : ''}`,
        });
        ti++;
      }
      if (ti >= frameTargets.length) break;
    } else {
      // capture the FIRST frame at or past each target phase; a motion that ends early
      // leaves the remaining tiles uncaptured and that is reported, not padded.
      while (ti < phaseTargets.length && s.phase != null && s.phase >= phaseTargets[ti]) {
        await capture({ frame: f, t: s.t, phase: s.phase, target: phaseTargets[ti], label: `p${s.phase.toFixed(3)}` });
        ti++;
      }
      if (s.phase == null && manifest.tiles.length) {
        // the motion has ended: one more tile of where it PUT the body. A swing that snaps
        // back to rest and a swing that settles into it are indistinguishable without this.
        await step(spec.restAfter ?? 6);
        const r = await read();
        await capture({ frame: r.frame, t: r.t, phase: null, label: 'rest' });
        if (ti < phaseTargets.length) {
          say(`⚠️ the motion ended after ${ti}/${phaseTargets.length} phase targets — the sheet is short, it was not padded`);
        }
        break;
      }
    }
  }

  manifest.anchor = { predicted: anchorFrame, measured: anchorSeenAt };
  manifest.track = track.map((s) => ({ f: s.f, p: s.phase == null ? null : +s.phase.toFixed(3) }));

  // ---- did the schedule match reality? -------------------------------------------------
  if (anchorSeenAt != null && anchorFrame != null) {
    const d = anchorSeenAt - anchorFrame;
    if (Math.abs(d) <= 1) pass(`${name}: contact lands where the sheet says it does`, `predicted frame +${anchorFrame}, measured +${anchorSeenAt}`);
    else fail(`${name}: contact lands where the sheet says it does`,
      `predicted frame +${anchorFrame} but the contact latch fired at +${anchorSeenAt} (${d > 0 ? '+' : ''}${d} frames, ${(d / FPS * 1000).toFixed(0)} ms) — EVERY TILE LABEL IN THIS SHEET IS OFF BY THAT MUCH. The motion's duration or contact phase has changed; update MOTIONS in harness/strobe.mjs.`);
  } else if (anchorFrame != null) {
    fail(`${name}: contact lands where the sheet says it does`, 'the contact latch never fired during the sampled window — this sheet may not contain an impact at all');
  }

  if (spec.outcome) {
    manifest.outcome = await evalStr(page, spec.outcome);
    say(`outcome: ${JSON.stringify(manifest.outcome)}`);
    if (mode === 'impact') {
      if (manifest.outcome?.hadPanel) pass(`${name}: the strobed blow hit a wall panel`, JSON.stringify(manifest.outcome.res));
      else if (manifest.outcome) fail(`${name}: the strobed blow hit a wall panel`, 'the contact raycast found no panel — the sheet shows a swing into empty air, not an impact');
      else skip(`${name}: the strobed blow hit a wall panel`, 'the view records no contact result to read');
    }
  }

  const got = manifest.tiles.filter((t) => t.file).length;
  say(`${got}/${mode === 'impact' ? frameTargets.length : n} tiles captured -> ${path.relative(ROOT, outDir)}`);
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

// ============================================================================ composition

const run = (args, opts = {}) => new Promise((res) => {
  const c = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  c.on('exit', (code) => res(code ?? 1));
});

const runQuiet = (args, opts = {}) => new Promise((res) => {
  const c = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (code) => res({ code: code ?? 1, out }));
});

/** Tile a manifest's frames into one (or two) sheets via `sheet.mjs`. */
export async function composeSheets(manifest, { cols } = {}) {
  if (!manifest) return null;
  const tiles = manifest.tiles.filter((t) => t.file);
  if (!tiles.length) return null;
  // Beside the frames, not at a fixed path — two runs with different --out were writing their
  // sheets over each other while their frame directories stayed correctly separate.
  const base = path.join(path.dirname(manifest.dir), '_sheets');
  await mkdir(base, { recursive: true });
  const c = cols ?? Math.min(5, Math.ceil(Math.sqrt(tiles.length)) + 1);
  const out = { normal: null, silhouette: null };

  const sheetOf = async (key, file, width) => {
    const imgs = manifest.tiles.map((t) => t[key]).filter(Boolean);
    if (!imgs.length) return null;
    const args = [path.join(ROOT, 'harness/sheet.mjs'), '--out', file, '--cols', String(c), '--width', String(width)];
    for (const i of imgs) args.push('--img', i);
    const r = await runQuiet(args);
    if (r.code !== 0) { console.error(r.out); return null; }
    return file;
  };

  out.normal = await sheetOf('file', path.join(base, `${manifest.name}.${manifest.mode}.png`), 1800);
  if (manifest.silhouette) {
    out.silhouette = await sheetOf('silFile', path.join(base, `${manifest.name}.${manifest.mode}.silhouette.png`), 1800);
  }
  manifest.sheets = out;
  await writeFile(path.join(manifest.dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return out;
}

// ============================================================================ verification
//
// ⚠️ THIS SECTION IS THE POINT. "The function ran" is not evidence — this project has been
// burned six times by an instrument that worked and produced nothing. Decode the tiles that
// were actually written and check them.

/** Per-image stats, computed in a headless canvas (the same trick sheet.mjs uses). */
async function statsFor(files) {
  const { browser, page } = await openCanvasPage();
  const urls = [];
  for (const f of files) urls.push(await toDataURL(f));
  const stats = await page.evaluate(async (urls) => {
    const load = (src) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = src;
    });
    const out = [];
    let prevHash = null;
    for (const u of urls) {
      const im = await load(u);
      const W = 160, H = Math.max(1, Math.round(160 * im.height / im.width));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      let sum = 0, sum2 = 0, ink = 0, ground = 0, n = 0;
      const lum = new Float32Array(W * H);
      for (let i = 0, k = 0; i < d.length; i += 4, k++) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        lum[k] = L; sum += L; sum2 += L * L; n++;
        if (L < 40) ink++; else if (L > 170) ground++;
      }
      const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
      // cheap perceptual hash against the previous tile: mean abs difference of the
      // downsampled luma. Two identical frames read 0.
      let diff = null;
      if (prevHash) { let s = 0; for (let k = 0; k < Math.min(lum.length, prevHash.length); k++) s += Math.abs(lum[k] - prevHash[k]); diff = s / Math.min(lum.length, prevHash.length); }
      prevHash = lum;
      out.push({ mean: +mean.toFixed(2), std: +std.toFixed(2), ink: +(ink / n).toFixed(3), ground: +(ground / n).toFixed(3), diff: diff == null ? null : +diff.toFixed(3) });
    }
    return out;
  }, urls);
  await browser.close();
  return stats;
}

/**
 * Check the sheet is a picture of something, and refuse to claim success otherwise.
 *
 * Three failure modes, all of which have really happened to instruments in this repo:
 *   BLANK      a tile with near-zero variance is an unpainted canvas, not a dark scene
 *   FROZEN     every tile identical means the pump never advanced the world; the sheet is a
 *              tiled copy of one frame and looks entirely convincing
 *   NOT FLAT   a silhouette that failed renders the normal frame — still a picture, wrong test
 */
export async function verify(manifest) {
  const rep = { normal: null, silhouette: null, verdicts: [] };
  const add = (s, name, detail) => rep.verdicts.push({ s, name, detail });

  const files = manifest.tiles.map((t) => t.file).filter(Boolean);
  if (files.length < 2) { add('SKIP', 'the strobe produced a readable sheet', `only ${files.length} tile(s) on disk — nothing to compare`); return rep; }

  const st = await statsFor(files);
  rep.normal = st;
  const blank = st.filter((s) => s.std < 1.5).length;
  const diffs = st.map((s) => s.diff).filter((d) => d != null);
  const still = diffs.filter((d) => d < 0.5).length;

  if (blank) add('FAIL', 'every strobe tile is a picture of something', `${blank}/${st.length} tile(s) have luminance std < 1.5 — that is a blank or unpainted frame, not a dark scene`);
  else add('PASS', 'every strobe tile is a picture of something', `luminance std ${Math.min(...st.map((s) => s.std)).toFixed(1)}-${Math.max(...st.map((s) => s.std)).toFixed(1)}`);

  if (!diffs.length) add('SKIP', 'the frames actually advance between tiles', 'fewer than two decodable tiles');
  else if (still === diffs.length) add('FAIL', 'the frames actually advance between tiles',
    'EVERY consecutive pair is identical — the frame pump did not advance the world and this sheet is one frame tiled N times');
  else if (still) add('PASS', 'the frames actually advance between tiles',
    `mean inter-tile change ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)} (${still} pair(s) nearly still — check those tiles, a held pose is legitimate)`);
  else add('PASS', 'the frames actually advance between tiles', `mean inter-tile change ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)}`);

  const sils = manifest.tiles.map((t) => t.silFile).filter(Boolean);
  if (manifest.silhouette) {
    if (!sils.length) add('FAIL', 'the silhouette sheet is flat black on a light ground', 'no silhouette tiles were written at all');
    else {
      const ss = await statsFor(sils);
      rep.silhouette = ss;
      // ⚠️ BIMODALITY ALONE IS NOT ENOUGH, AND THIS TOOL SHIPPED A SHEET THAT PROVED IT.
      // The first run scored 98.9% "ink-or-ground" and PASSED — because it was a 98.9% BLACK
      // rectangle. Every pixel was ink, there was no ground, and the check could not tell the
      // difference between a silhouette and a black frame. A silhouette needs BOTH phases
      // present: something in front, and something behind it to be in front OF.
      const bimodal = ss.map((s) => s.ink + s.ground);
      const worst = Math.min(...bimodal);
      const minGround = Math.min(...ss.map((s) => s.ground));
      const maxInk = Math.max(...ss.map((s) => s.ink));
      const minInk = Math.min(...ss.map((s) => s.ink));
      if (minGround < 0.15) add('FAIL', 'the silhouette sheet is flat black on a light ground',
        `a tile has only ${(minGround * 100).toFixed(1)}% light ground — there is nothing behind the figure for it to read against. Almost always means the architecture is still drawn: use --scope figure (default) or --scope subject.`);
      else if (minInk < 0.002) add('FAIL', 'the silhouette sheet is flat black on a light ground',
        'a tile contains essentially no ink — the ground rendered but the subject is not in front of it (wrong camera, or the subject was hidden by the scope)');
      else if (maxInk > 0.80) add('FAIL', 'the silhouette sheet is flat black on a light ground',
        `a tile is ${(maxInk * 100).toFixed(1)}% ink — the figure fills the frame, which is a black rectangle, not a silhouette`);
      else if (worst < 0.90) add('FAIL', 'the silhouette sheet is flat black on a light ground',
        `the flattest tile has only ${(worst * 100).toFixed(1)}% of pixels at ink-or-ground — the override material did not take, so this is a normally-shaded frame wearing a silhouette's filename`);
      else add('PASS', 'the silhouette sheet is flat black on a light ground',
        `${(worst * 100).toFixed(1)}-${(Math.max(...bimodal) * 100).toFixed(1)}% ink-or-ground · figure ${(minInk * 100).toFixed(1)}-${(maxInk * 100).toFixed(1)}% of frame · ground ${(minGround * 100).toFixed(1)}% at its least`);
    }
  }
  return rep;
}

// ============================================================================ CLI

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
  const flag = (n) => argv.includes('--' + n);

  const motion = opt('motion', 'sledge');
  if (!MOTIONS[motion]) { console.error(`unknown --motion "${motion}". Known: ${Object.keys(MOTIONS).join(', ')}`); process.exit(2); }
  const mode = opt('mode', 'uniform');
  if (!['uniform', 'impact'].includes(mode)) { console.error('--mode must be uniform or impact'); process.exit(2); }

  const cfg = {
    motion, mode,
    name: motion,
    n: +opt('n', mode === 'impact' ? 14 : 10),
    silhouette: flag('silhouette'),
    cam: opt('cam', 'profile'),
    scope: opt('scope', 'figure'),
    dist: +opt('dist', 3.0),
    camH: +opt('camh', 1.05),
    lookH: +opt('lookh', 0.95),
    fov: opt('fov') ? +opt('fov') : 0,
    stageLight: !flag('no-stage'),
    exposure: +opt('exposure', 2.6),
    prehits: +opt('prehits', 0),
    before: +opt('before', 0.15),
    after: +opt('after', 0.40),
    hud: opt('hud', '1') !== '0',
    out: opt('out', 'progress/strobe'),
  };

  const PORT = opt('port', '5194');
  const VIEW = opt('view', 'game.play');
  const QS = opt('q', 'seed=s4');

  console.log(`\n  STROBE  ${motion} · ${mode} · ${cfg.n} tiles${cfg.silhouette ? ' · +silhouette' : ''}`);
  console.log(`  one browser session on :${PORT} (a strobe that rebooted per phase would cost 75 s x N and be unusable)\n`);

  const code = await run([
    path.join(ROOT, 'harness/playtest.mjs'),
    '--view', VIEW, '--port', PORT, '--seconds', '1',
    '--script', 'harness/scenarios/strobe-run.mjs',
    '--q', QS,
  ], { env: { ...process.env, RRR_STROBE: JSON.stringify(cfg) } });

  const dir = path.resolve(ROOT, cfg.out, `${cfg.name}.${mode}`);
  const mf = path.join(dir, 'manifest.json');
  if (!existsSync(mf)) {
    console.error(`\n  NO SHEET. The run wrote no manifest to ${path.relative(ROOT, mf)} — read the playtest output above.`);
    console.error('  A strobe that could not observe reports nothing, never a sheet.');
    process.exit(code || 1);
  }
  const manifest = JSON.parse(await readFile(mf, 'utf8'));

  console.log('\n  tiling …');
  const sheets = await composeSheets(manifest);
  console.log('\n  verifying the OUTPUT (not that a function ran) …');
  const rep = await verify(manifest);

  console.log(`\n  STROBE VERIFICATION  ${motion}.${mode}\n`);
  for (const v of rep.verdicts) {
    const m = v.s === 'PASS' ? ' ok ' : v.s === 'FAIL' ? 'FAIL' : 'skip';
    console.log(`  ${m}  ${v.name.padEnd(46)} ${v.detail}`);
  }
  const bad = rep.verdicts.filter((v) => v.s === 'FAIL').length;
  console.log('');
  if (sheets?.normal) console.log(`  sheet       ${path.relative(ROOT, sheets.normal)}`);
  if (sheets?.silhouette) console.log(`  silhouette  ${path.relative(ROOT, sheets.silhouette)}`);
  console.log(`  frames      ${path.relative(ROOT, dir)}`);
  if (manifest.anchor?.measured != null) {
    console.log(`  contact     frame +${manifest.anchor.measured}${manifest.anchor.predicted != null ? ` (predicted +${manifest.anchor.predicted})` : ''}`);
  }
  if (bad) console.log(`\n  ${bad} verification failure(s) — DO NOT FILE A VERDICT FROM THESE SHEETS until they are understood.`);
  else console.log('\n  Open the sheet and look at it. This tool proves the frames are real and distinct;');
  console.log('  it has no opinion whatsoever about whether the motion is any good.');

  if (!flag('keep-tiles') && sheets?.normal) {
    // the individual frames are large and the sheet is the deliverable; manifest.json stays
    for (const f of await readdir(dir)) if (f.endsWith('.png')) await rm(path.join(dir, f), { force: true });
  }
  process.exitCode = bad ? 1 : code;
}
