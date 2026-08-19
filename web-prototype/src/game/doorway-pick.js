/**
 * Doorway picker — aims the existing sledge at the (u, v) that most quickly
 * opens a robot-scale channel. Measured 2026-08-16 in
 * harness/_taskrun_picker_measure.mjs against the real DamageField.
 *
 * Open test is field.channel(0.34, 1.70, 0.30).open — the same predicate
 * wall.js blocksMovement() already uses. Do NOT retarget at COLLAPSE.fail.
 * Arch collapse is a side effect of the winning drive, not the goal.
 *
 * Winner: each swing, the shallowest still-solid cell in an 0.80 m-wide
 * window centred on the face, y in [0, 1.95] m. That opened in 3 blows on
 * 5.72 / 2.96 / 2.08 m clear-barrier faces. Hammering one UV never opens.
 *
 * This file does not talk about wall-stage finish rows. The reach-target
 * for the task-run is a separate reachJack object.
 */
export const CHANNEL_R = 0.34;
export const CHANNEL_H = 1.70;
export const CHANNEL_STEP = 0.30;
export const WINDOW_W = 0.80;
export const WINDOW_Y0 = 0;
export const WINDOW_Y1 = 1.95;

export function channelOpen(field, baseY = 0) {
  return field.channel(CHANNEL_R, CHANNEL_H, CHANNEL_STEP, baseY).open;
}

/**
 * @param {import('../destruction/damagefield.js').DamageField} field
 * @param {{ centreU?: number, windowW?: number, y0?: number, y1?: number, baseY?: number }} [opts]
 * @returns {{ u: number, v: number } | null}
 */
export function pickDoorwayHit(field, opts = {}) {
  const baseY = opts.baseY ?? 0;
  if (channelOpen(field, baseY)) return null;

  const winW = opts.windowW ?? WINDOW_W;
  const y0 = opts.y0 ?? WINDOW_Y0;
  const y1 = opts.y1 ?? WINDOW_Y1;
  const centreU = opts.centreU ?? 0.5;
  const midX = centreU * field.width;
  const x0 = midX - winW / 2;
  const x1 = midX + winW / 2;

  const cx0 = Math.max(0, Math.floor(x0 / field.cellW));
  const cx1 = Math.min(field.cols - 1, Math.ceil(x1 / field.cellW));
  const cy0 = Math.max(0, Math.floor(y0 / field.cellH));
  const cy1 = Math.min(field.rows - 1, Math.ceil(y1 / field.cellH));

  let bx = -1, by = -1, bd = 2;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const i = field.idx(cx, cy);
      if (field.barrier[i]) continue;
      const d = field.depth[i];
      if (d >= 0.999) continue;
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
  }
  if (bx < 0) return null;
  return { u: (bx + 0.5) / field.cols, v: (by + 0.5) / field.rows };
}
