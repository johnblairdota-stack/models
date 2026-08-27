/**
 * caption-layer — the one number that says "this object is a caption, not scenery".
 *
 * WHY THIS FILE IS ITS OWN MODULE. Two places have to agree: `characters/chest-nameplate.js`
 * puts sprites on the layer, and `post/pipeline.js` draws that layer after the grade. Neither
 * should import the other — a post-processing stack that reaches into `characters/` is a cycle
 * waiting to happen, and the layer number would end up written twice and drift.
 *
 * WHY A COUNTER. The overlay pass is a second `projectObject` walk of the scene. In the
 * survival game there are no captions at all, and paying for that walk every frame to draw
 * nothing is the kind of cost that gets a feature reverted. `captionCount()` lets the pipeline
 * skip the pass entirely until something is actually on the layer.
 *
 * ⚠️ Layer 1, not 0. Layer 0 is where every object starts, and `sprite.layers.set(1)` REPLACES
 * the mask rather than adding to it — that is what keeps captions out of the main pass without
 * touching the main pass at all. A caption on layer 0 as well would be drawn twice: once
 * inside the grade (fogged, which is the bug) and once over it.
 */

export const CAPTION_LAYER = 1;

let live = 0;

/** Called when a caption sprite joins the scene. */
export function captionAdded() { live++; }

/** Called when one is disposed. Floored at zero — a double-dispose must not go negative. */
export function captionRemoved() { live = Math.max(0, live - 1); }

/** How many captions exist. The pipeline skips its overlay pass when this is 0. */
export function captionCount() { return live; }

/** Test hook: forget everything. Not called by the game. */
export function captionReset() { live = 0; }
