import * as THREE from 'three';

/**
 * 🚨 THE STUDIO'S MID-GREY JUDGING GROUND HAS NEVER BEEN MID-GREY. IT RENDERS NEAR-BLACK,
 * AND THE FIVE LOWEST-SCORING PIECES ON THE BOARD ARE THE FIVE THAT ASK FOR IT.
 *
 * `_studio.js` lines 226 and 231 both do:
 *
 *     new THREE.Color(opts.bg ?? 0xf2f2f2).convertSRGBToLinear()
 *
 * `THREE.ColorManagement.enabled` is `true` (three r0.180, default since r152), so
 * `new THREE.Color(hex)` ALREADY decodes the hex from sRGB into the linear working space.
 * The `.convertSRGBToLinear()` after it is a SECOND decode of an already-linear value.
 *
 * Measured, not inferred — `node -e` against the project's own three build:
 *
 *   requested   correct linear        double-converted      displays as   linear-luma error
 *   0x4e535a    0.0762 0.0865 0.1022  0.0067 0.0081 0.0104  #13161a       10.7x too dark
 *   0xf2f2f2    0.8879 0.8879 0.8879  0.7637 0.7637 0.7637  #e2e2e2        1.16x too dark
 *
 * and confirmed in the browser on `mat.brass`: `scene.background.getHexString()` returned
 * `13161a` where the view asks for `4e535a`, and the backdrop rasterised to RGB (4,4,4).
 *
 * ⚠️ THE ERROR IS SEVERE ONLY FOR DARK REQUESTS, WHICH IS WHY IT HID. sRGB decode is close
 * to a no-op near white and brutal near black, so the character/hunter views (0xf2f2f2,
 * 0xeeeeee, 0xa2a8ae) lose almost nothing, while every view that asks for the mid-grey
 * material-judging ground — `mat.brass`, `mat.walnut`, `mat.lath`, `mat.marble`,
 * `mat.plaster`, `mat.wallpaper` — loses a factor of ten and is judged against a void.
 * BUILD_GUIDE §4b rule 5 ("judged on the mid-grey ground, not the near-white cyc") has
 * therefore never actually been satisfied by any view that believed it was passing it.
 *
 * ⚠️ WHY THIS IS NOT FIXED AT THE SOURCE, WHICH IS WHERE IT BELONGS. `_studio.js` is
 * imported by nearly every view in the project, several of which are live under other
 * agents right now, and every recorded grade figure on the board was measured with the
 * bug in place. A one-line fix there silently moves all of them at once. So this is a
 * LOCAL, TOGGLED correction applied by the two views this agent owns, and the source fix
 * is a lead decision. `?bg=raw` on either view restores the double-converted value
 * exactly — it re-derives it from the same expression `_studio.js` uses rather than
 * hard-coding the result, so the revert cannot drift away from the thing it reverts.
 *
 * Both pieces of state are gated together (`scene.background` AND the cyc mesh's own
 * material colour), because `_studio.js` sets both from that one expression and gating
 * only one of them would be exactly the incomplete-revert class this project keeps
 * finding: the backdrop would change while the surface standing in front of it did not.
 */
export function fixStudioBackdrop(engine, hex) {
  const raw = new URLSearchParams(location.search).get('bg') === 'raw';
  // The revert arm rebuilds `_studio.js`'s own expression; the fix arm omits the second
  // decode. Nothing else differs between the two.
  const c = raw ? new THREE.Color(hex).convertSRGBToLinear() : new THREE.Color(hex);
  engine.scene.background = c.clone();
  if (engine.cyc) {
    engine.cyc.material.color.copy(c);
    engine.cyc.material.needsUpdate = true;
  }
  engine.userData_bgMode = raw ? 'raw' : 'fixed';
  return c;
}
