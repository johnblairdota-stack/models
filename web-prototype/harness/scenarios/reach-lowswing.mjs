/**
 * 🔨 **WHAT A PLAYER ACTUALLY SEES WHILE UNDERCUTTING A WALL** — the `--cam play` sheet for the
 * one thing `support.js` rewards and the camera has always made expensive.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/reach-lowswing.mjs \
 *        --port 5386 --q "seed=s4"
 *
 * ⚠️ **READ `harness/strobe.mjs`'s "WHAT IT CANNOT TELL YOU" HEADER BEFORE FILING ANYTHING OFF
 * THESE SHEETS.** In particular: a sheet is N discrete instants and cannot show a hitch between
 * two of them; tiles are evenly spaced in PHASE, not in perceived pace; the staging lifts the
 * exposure to 2.6 so **no grade or lighting verdict may be quoted from here**; and a DEGRADED
 * ANCHOR line means the subject may not be a first blow on a clean dig panel at a workable
 * standoff — the tool prints it and so does this file.
 *
 * ⚠️ **AND `--cam play` IS THE WRONG CAMERA FOR JUDGING A SWING, DELIBERATELY.** strobe.mjs's own
 * header: from behind, the hammer disappears behind the torso for the whole second half. That is
 * not a defect of this sheet, it is the question it asks — *what is the player shown while they
 * dig at the skirting* — and the swing itself is judged from `--cam profile` elsewhere
 * (`critic-swing-2`, passed).
 *
 * 🎯 **THE ONE THING THIS ADDS OVER `strobe.mjs --motion sledge --cam play`:** the shipped setup
 * leaves the pitch wherever the boot left it (about −0.13 rad, which now lands the blow near
 * 0.96 m — chest height, not the skirting). This aims **as low as the arm can reach, by asking
 * the game rather than by computing it** — sweep the down half of the look clamp, cast the
 * game's own `_swingRay` at each sample, keep the pitch whose real impact is lowest. That makes
 * the sheet a picture of the rewarded play instead of a picture of the default pose, and it
 * needs no knowledge of how the aim is modelled, so it cannot go stale the way a closed-form
 * inverse would.
 */
import { MOTIONS, strobe, composeSheets } from '../strobe.mjs';

/**
 * ⚠️ **NOT ONE BACKTICK BELOW THIS LINE.** The whole thing is a template literal handed to
 * `evalStr`, and a backtick quoting an identifier inside it terminates the string and takes the
 * build down. HANDOFF counts five separate incidents of exactly this, in five files.
 */
const AIM_LOW = `() => {
  const base = (${MOTIONS.sledge.setup})();
  if (!base || !base.ok) return base;
  const e = window.__rrr.engine, p = e.player;
  let best = 0, bestY = 99;
  for (let i = 0; i <= 96; i++) {
    const q = -0.95 * (i / 96);
    p.aimPitch = q;
    const r = p._swingRay();
    const h = e.room.castRay(r.origin, r.dir, 2.45, { forDamage: true });
    if (!h || !h.panel) continue;
    if (h.point.y < bestY) { bestY = h.point.y; best = q; }
  }
  p.aimPitch = best;
  if (e.cam) e.cam.pitch = best;
  const out = {};
  for (const k in base) out[k] = base[k];
  out.lowPitch = +best.toFixed(3);
  out.impactY = bestY === 99 ? null : +bestY.toFixed(3);
  out.aimDecoupled = p.aimDecoupled;
  return out;
}`;

export default async function reachLowSwing(ctx) {
  ctx.note('strobing the sledgehammer swing from the PLAY camera, aimed as low as the arm reaches');
  // The contact window: this is where the body, the dust and the breach all arrive at once, and
  // the whole question is whether the player can see the bottom of the wall through them.
  const m = await strobe(ctx, {
    ...MOTIONS.sledge,
    setup: AIM_LOW,
    name: 'reach-lowswing',
    label: 'sledgehammer swing at the skirting, play camera',
    mode: 'impact',
    cam: 'play',
    n: 14,
    prehits: 2,
  });
  // ⚠️ `strobe()` writes TILES; the SHEET is composed by strobe.mjs's own CLI main, so a scenario
  // that forgets this line produces fourteen loose PNGs and no contact sheet — which is the one
  // artefact the whole tool exists for. Caught on this file's first run.
  const sheets = await composeSheets(m);
  if (sheets?.normal) ctx.note(`sheet -> ${sheets.normal}`);
  else ctx.skip('the contact sheet was composed', 'composeSheets returned nothing');
}
