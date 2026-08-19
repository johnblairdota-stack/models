import * as THREE from 'three';
import { collapse as collapseUnsupported, strain as strainField } from './support.js';

/**
 * FREE-FORM POSITIONAL DESTRUCTION — one damage grid per destructible wall face.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * John played the segmented "dud bay" dig and rejected it: *"I don't really want to use the
 * dud bay. I wanted a whole new system where white chucks fall off when hit with the hammer."*
 * `docs/design/dig.md` §3 always called this approach A — *"the real thing, later"*.
 *
 * `dig.md` §1's justification for the whole mechanic was that *"with a handful of fixed
 * candidates you find the way through by counting padlocks. Here there is nothing to count —
 * the wall is continuous and the answer is inside it."* **Nine bays per wall is nine
 * candidates.** Segmentation moved the counting from padlocks to panels and kept the defect.
 * So the wall has to be continuous, and "where in this wall?" has to be answered by digging.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THE CPU ARRAY IS THE TRUTH. THE TEXTURE IS A MIRROR OF IT.
 * ---------------------------------------------------------------------------
 * This is the single most important property in the file and it is why the grid is here and
 * not in a shader. A continuous wall has no stages to hang collision, pathfinding and
 * line-of-sight off — so if the renderer and the collider read two different structures they
 * drift, and the failure is the worst class this project records: it does not throw, it just
 * means what you see and what you can walk through stop agreeing. So:
 *
 *   · `depth` (Float32Array) is written by exactly ONE method, `_add()`.
 *   · `texture` is a mirror, refreshed by `flush()`, which the owner calls ONCE PER FRAME.
 *     ⚠️ **NOT once per hit.** A hammer landing three times a second must not upload three
 *     times; `dirty` is a flag, not a queue.
 *   · every gameplay query (`passable()`, `solidRects()`, `openArea()`) reads `depth`, never
 *     the texture and never a second cached structure that could disagree.
 *
 * ---------------------------------------------------------------------------
 * THE TWO CHANNELS, AND WHY THE BARRIER LIVES IN THE SAME TEXTURE
 * ---------------------------------------------------------------------------
 * RGBA8, and only two channels carry anything:
 *
 *   R  depth 0..1     0 intact, 1 dug through to whatever is behind
 *   G  barrier 0/1    1 = there is structure behind this cell that you cannot pass
 *   B  depth, BLURRED — the RENDERER's copy, and nothing in play may ever read it. See
 *      `_smooth()`: the brush has a hard rim, so R steps by its whole range across one cell and
 *      every threshold taken against it rasterises the brush disc into 9 cm stairs.
 *
 * `dig.md`'s barrier used to be a merged brick slab in `room.js`'s GeoBin with a
 * degenerate-vertex "hide". Putting it in the G channel instead buys three things that the
 * slab could not:
 *
 *   1. **The interconnect can be any shape.** A seeded blob, not a rectangle and not a bay —
 *      so there is nothing to count, which was the whole point (`dig.md` §1).
 *   2. **The house-wide unlock is one pass over G.** John: *"the barrier disapears when a
 *      robot uses the interconnect… allowing other player to walk through the other areas
 *      they destroyed the white wall through to the other room."* Every abandoned dig becomes
 *      a doorway on the same frame, because passability is `depth >= 1 && !barrier` and
 *      nothing else.
 *   3. **It gives nothing away while closed.** G is only ever legible where R is already high,
 *      because the barrier plane discards where the wall in front of it survives.
 *      `procedural-map.md` §2's rule, enforced by construction rather than by dressing.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ DETERMINISM: NEVER SYNC THE MASK, REPLAY THE HITS
 * ---------------------------------------------------------------------------
 * `dig.md` §3 lists *"new network sync (a mask is not one float)"* as this approach's cost.
 * The answer is that the mask is never on the wire: `hits` is the ordered list of
 * (u, v, power) and `replay()` reconstructs the field exactly, because `_add()` is a pure
 * function of the field and the hit. It is tiny, it is order-dependent in exactly the way the
 * physical wall is, and capture determinism depends on the same property.
 */

/**
 * ⚠️ **ONE CELL IS ~9.4 cm AND THE NUMBER IS A GAMEPLAY DECISION, NOT A TEXTURE DECISION.**
 *
 * The brush radius is 0.52 m, so a blow covers ~11 cells across — enough for the radial falloff
 * to be a *shape* rather than a stamp, which is what stops two holes beside each other reading
 * as the same decal twice. Go coarser and the hole edge steps visibly against the baked break
 * field it is supposed to be modulating; go finer and both the texture upload and the
 * passability sweep grow quadratically for detail the break mask is already providing.
 *
 * On the shipped dig band (5.72 x 2.80 m) this is 61 x 30 = 1830 cells, i.e. a 61x30 RGBA
 * texture — 7.3 kB, uploaded at most once per frame per damaged face.
 */
export const CELL = 0.094;

/**
 * Brush radius in metres at power 1 — the ZONE OF INFLUENCE of one blow, not the crater.
 * `dig.md` §5: a blow removes a patch, not a pixel.
 *
 * ⚠️ **THE SLICE SPECIFIED 0.35 m AND MEASUREMENT MOVED IT TO 0.52.** At 0.35 the hole DEEPENS
 * fast and WIDENS slowly, because widening happens only at the brush's rim — and John's band is
 * about opening a body-sized hole, which is 1.16 m² of wall. Headless against the real field,
 * 0.35 m put one breakthrough at 88 blows against a target of ~45. What you SEE is unchanged in
 * character: the visible hole is wherever the depth crosses a layer's band (`wall.js`
 * `DAMAGE_BANDS`), so a wide shallow zone of influence still reads as a small hole with cracks
 * running out of it, which is what the reference photographs show.
 *
 * 🎯 **ROUND 8 SWEPT THIS AND PUT IT BACK, AND THE ROUTE MATTERS MORE THAN THE OUTCOME.** `GRAIN`
 * moves gameplay truth, so the first answer was to re-tune here: at `(0.47, STRENGTH 0.36)` the
 * per-blow figure held at 0.196 and the browser read **74 s**, one second inside John's band. That
 * is a bad place to ship from, and the reason it was needed turned out to be a defect rather than
 * a cost — the grain was still hard at depth 0.99, where nothing can see it. With the grain's
 * depth taper and its area bias (both in `GRAIN`), the shipped 0.52 / 0.31 hold **0.199 m²·depth
 * and 66 s** with the grain fully on, so this number did not have to move at all.
 * ⚠️ 15 combinations were driven to establish that (`harness/_tmp_lobesim.mjs`); larger radii at
 * constant per-blow are strictly WORSE (R 0.64 reads 88 s), because the probe cost rises with the
 * lower strength and the search formula multiplies the probe by the number of duds.
 */
export const BRUSH_R = 0.52;

/**
 * 🎯 **THE TWO NUMBERS JOHN'S BAND IS MADE OF.** Set 2026-08-08: *"about a minute to dig into
 * another room"* — ~60 s median, 45–75 s acceptable, measured first blow → standing in the next
 * room and INCLUDING every abandoned dig.
 *
 * 🚨 **IT IS A BAND, NOT A DIRECTION. 25 s is as much a failure as 120 s**, because reading how
 * fast the wall gives way IS the search (`dig.md` §5) and a "faster is better" reading deletes
 * the mechanic.
 *
 * `STRENGTH` is the depth a full-power blow adds at the brush centre on PRISTINE material.
 * `RESIST` is how much harder it gets: the increment is divided by `1 + RESIST * depth^2`, so a
 * cell at half depth takes 1.75x the blows a fresh one does and a cell at 90% takes 3.4x. That
 * is John's *"they can destroy big chunks initially but it becomes less and less"* as an
 * equation, and it is the only channel the player has — `dig.md` §6a.2 forbids a HUD number and
 * John repeated it the same day (*"no numeric destruction meter"*).
 *
 * ⚠️ **THE FALLOFF IS PER CELL, NOT PER FACE.** That is the difference between this and the
 * stage table it replaces: moving 40 cm along the wall gets you fresh, fast material again, so
 * "this spot is bottoming out, move along" is a thing you can feel and act on rather than a
 * property of the whole bay.
 */
/**
 * ⚠️ Per-blow removal on pristine wall is `STRENGTH * pi * R² * (RIM + 0.30 * (1 - RIM))` —
 * 0.1942 m²·depth at the shipped numbers, and the closed form is worth having because it is the
 * thing `GRAIN`'s area bias had to be measured against. Round 8 did not move this; see `BRUSH_R`.
 */
export const STRENGTH = 0.31;
export const RESIST = 3.0;

/**
 * 🚨 **THE BASE DIG SPEED. JOHN DECIDED THIS ON 2026-08-09 AND IT IS x8 OF EVERY NUMBER ABOVE.**
 *
 * > *"I think my pacing is also off thats why I asked for the dig speed tool. I was playing on 8x
 * > and that actually should be the base speed."*
 *
 * `docs/design/teardown-reference.md` is why: **one sledgehammer hit takes a whole bay off a plank
 * shed, two destroy a vanity unit, three make a body-sized hole with daylight through.** Ours was
 * ~56 blows. This is the multiplier that puts us in the reference's order.
 *
 * 🎯 **IT LIVES HERE, ON THE FIELD'S ONLY WRITER, AND THAT IS THE WHOLE POINT.** `player.digPower`
 * — the `[ ]` testing key — cannot be the base, because every instrument in the project drives
 * `panel.applyHit(point, 1)` directly and never goes through the player at all (`dig-band.mjs`,
 * `dig-free.mjs`, `_th1-section.mjs`, `_st1-remain.mjs`, the headless sim). A base that only the
 * player could see would leave every gate measuring a pacing nobody plays.
 *
 * 🚨 **AND THE x8 JOHN PLAYED WAS NEVER DELIVERED ON A DIG FACE — MEASURED, NOT ARGUED.** `_add()`
 * read `power = clamp(rec.power, 0, 1)` and `player.js` passes `SLEDGE_POWER * digPower`, so
 * `digPower` 2, 4 and 8 were **all identically 1** on the free arm. The key worked on the SCALAR
 * arm (`wall.js`'s stage fallback multiplies health by it unclamped, so x8 one-shots a breachable
 * panel), which is what he will have felt. So *"8x should be the base"* is a statement of intent,
 * not a calibration of the dig, and the clamp below is now split so the ladder is honest.
 *
 * ⚠️ **DAMAGE PER BLOW, NEVER THE COOLDOWN.** `WEAPON_COOLDOWN.sledge` is choreography
 * `sledge-check` gates and John has never complained about it.
 *
 * 📐 **SWEPT HEADLESS BEFORE IT WAS CHOSEN** (`harness/_tmp_lobesim.mjs --strength`, 8 seeded
 * interconnects, `dig-free.mjs`'s own drives — `x N` here is `STRENGTH * N`):
 *
 *   | base | m²·depth per blow | probe | breakthrough | search |
 *   |---|---|---|---|---|
 *   | x1 shipped | 0.2142 | 6 b | 35.4 b | 53.6 s |
 *   | x2 | 0.4284 | 3 b | 15.1 b | 24.3 s |
 *   | x4 | 0.8069 | 1 b | 4.0 b | 7.1 s |
 *   | x6 | 0.9038 | 1 b | 2.6 b | 5.8 s |
 *   | **x8 taken** | **0.9183** | **1 b** | **2.6 b** | **5.8 s** |
 *   | x10 | 0.9328 | 1 b | 2.6 b | 5.8 s |
 *
 * 🚨 **SO DAMAGE PER BLOW SATURATES AT ABOUT x6 AND x8 IS ON THE PLATEAU.** `_add` writes
 * `nd = min(1, d + inc)`: once one blow takes every cell in the brush clean through, more strength
 * has nothing left to remove and the only thing still growing is the sliver the grain floor holds
 * at the rim (0.9038 -> 0.9183 -> 0.9328). **The hole's SIZE is `BRUSH_R`, not this number**, so
 * anything faster than the plateau has to grow the brush — which changes the crater's silhouette,
 * the collider and the debris, and is a look decision a builder must not take alone.
 * x8 is shipped rather than x6 because it is the number John said and the two are indistinguishable.
 */
export const DIG_BASE = 8;

/**
 * ⚠️ **THE BRUSH IS NOT A CONE, AND THE FLOOR IS THE NUMBER JOHN'S BAND TURNED ON.**
 *
 * The first version deposited `smoothstep(r/R)` and fell to exactly 0 at the rim. Measured
 * headless against the real field, that put ONE breakthrough at **255 blows (242 s at a 0.95 s
 * swing)** against a ~60 s budget for the whole search — because a hole only widens where the
 * brush deposits, and a brush that deposits nothing at its rim can only widen through the thin
 * band where its falloff is still meaningful. The hole therefore deepened fast and grew slowly,
 * which is the opposite of the reference (`refs/_sheets/dig.png`: person-sized ragged holes
 * taken out in a few swings) and of John's sentence about big chunks.
 *
 * `RIM` is the fraction of the centre increment that still lands at the very edge of the brush.
 * At 0.62 a blow takes a real BITE out of the wall rather than drilling a dimple in it, and the
 * ragged silhouette comes from where it always came from — the baked break-order field being
 * thresholded (`breakmask.js`), not from the shape of the brush.
 *
 * 📐 **MEASURED HEADLESS AGAINST THIS FIELD, 8 SEEDS, COMPETENT AIM** (a player swings at the
 * material that is still standing, not at the air they just made):
 *
 *   · **probe to see what is behind a spot: 8 blows**
 *   · **breakthrough to a body-sized channel at the interconnect: 43 blows** (40–46)
 *   · **whole search, incl. 3 abandoned digs: 8x3 + 43 = 67 blows**
 *
 * 🎯 At a **0.95 s swing that is 64 s**, inside John's 45–75 s band with a 60 s median. ⚠️ **THE
 * SECONDS DEPEND ON A CADENCE THIS FILE DOES NOT OWN** — `sledge-1` owns the hammer. The band
 * holds for any swing between **0.70 s (50 s) and 1.10 s (78 s)**; outside that, retune `STRENGTH`
 * here rather than anywhere else, because it is the only number both figures scale with.
 *
 * 🔴 **ROUND 8 RE-MEASURED ALL THREE AGAINST `GRAIN`** (`harness/_tmp_lobesim.mjs`, 12 seeded
 * interconnects taken from `dig.js` itself — it reproduces `dig-free.mjs`'s own drives and its own
 * arithmetic, and with the grain off it prints **6 / 48 / 66 s**, i.e. what `dig-free.mjs` prints
 * in the browser, which is what makes it usable as an instrument):
 *
 *   · **probe 6 blows · opening the answer 48 blows · search 66 s**, with the grain fully on.
 *
 * Unchanged, and that is the result rather than a coincidence: see `GRAIN`'s depth taper and its
 * area bias, both of which exist so that a change to the SILHOUETTE does not become a change to
 * the dig.
 */
export const RIM = 0.62;

/**
 * 🎯 **ROUND 8: THE BRUSH IS NOT A DISC — AND THE PROOF THAT THE FIX HAS TO LIVE HERE, IN THE
 * DEPTH FIELD, RATHER THAN IN ANY SHADER. ⚠️ THE SHIPPED MECHANISM IS `GRAIN`, NOT THIS ONE.**
 *
 * Seven rounds of shader work failed one defect: *"the teal is a convex blob — not one re-entrant
 * notch and not one spur of surviving white poking INTO the teal anywhere in the crop."* Round 7
 * proved by arithmetic that no threshold term can fix it, and the proof is short enough to keep:
 *
 *   · the visible boundary is where `depth(x) = lo + (hi - lo) * order(x)`;
 *   · `depth` was a sum of overlapping BRUSH DISCS — smooth, single-humped and convex by
 *     construction — so every contour taken on it is a convex curve;
 *   · the only term that can beat a convex field discontinuously is `breakmask.js`'s `_bgPlate`,
 *     and its reach is bounded: +/-0.5 * uPlate = +/-0.25 at the shipped 0.50, i.e. +/-0.0925 of
 *     threshold, which against the measured radial depth gradient (~1.7 per metre) is **5.4 cm of
 *     radial travel**. A spur has to be 20-30 cm to read. `uPlate` cannot get there, and raising
 *     it saturates the clamp and returns round 4's islands.
 *
 * **So the non-convexity has to come from the DEPTH FIELD.** A single blow now removes a lobed
 * patch rather than a disc: the brush's edge is displaced RADIALLY by a mean-zero angular
 * function, three harmonics deep, with the phases hashed off the blow's own position.
 *
 * ⚠️ **A RADIAL OFFSET IN METRES, NOT A MULTIPLIER ON R, AND THE DIFFERENCE IS THE WHOLE POINT.**
 * Scaling the radius (`R * (1 + a·L)`) lobes every contour *proportionally*, so the deep contours
 * — which is where the teal boundary is — lobe by a fraction of what the rim does: at the teal
 * threshold the amplitude would be about half, i.e. 8 cm, back under the 20 cm a spur needs.
 * Displacing the profile bodily by `wob(theta)` metres moves EVERY threshold's contour by the same
 * distance, so what the rim does the teal boundary does too.
 *
 * 📐 **THE HARMONICS ARE CHOSEN AGAINST THE CONVEXITY TEST, NOT BY EYE.** A radial curve
 * `r = R + A·sin(k·theta)` is re-entrant (curvature < 0 at the notch) exactly when `A > R/(1+k²)`.
 * At `R` 0.52 and this amplitude:
 *
 *   | k | needed | present | |
 *   |---|---|---|---|
 *   | 2 | 0.173 m | 0.068 m | no — and correctly so: a 2-lobe curve is an ellipse, still convex |
 *   | 3 | 0.052 m | 0.096 m | **yes, 1.8x over** |
 *   | 5 | 0.020 m | 0.064 m | **yes, 3.2x over** |
 *
 * so the coarse harmonic supplies the gross asymmetry and the two higher ones supply the bays.
 * Peak-to-trough on one blow is ~0.35 m, which survives `_smooth()`'s 11 cm blur as a ~25 cm
 * feature — the size the reference's spurs actually are.
 *
 * 🚨 **AND IT MOVES GAMEPLAY TRUTH, WHICH IS WHY IT WAS MEASURED RATHER THAN SHIPPED ON THE
 * ARGUMENT ABOVE.** Any mean-zero radial displacement enlarges what one blow removes by
 * `pi * <wob²>` of area — at amplitude 0.36 that was **0.1942 -> 0.2018 m²·depth**, +3.9%. The same
 * correction `GRAIN` now carries would have paid for it. It never got that far, because the shape
 * it bought was not worth the number: see the table under `GRAIN`.
 *
 * ⚠️ **THE PHASES ARE HASHED OFF THE BLOW'S POSITION, QUANTISED TO A MILLIMETRE.** `replay()` is
 * the network and determinism path (see the header), and it reconstructs the field from the hit
 * list alone — so the lobes must be a pure function of the hit and nothing else. Not a counter,
 * not an RNG, not the field's own state. The millimetre quantisation is so a hit that survives a
 * float round-trip on the wire lands on the same lattice cell and reproduces the same silhouette.
 *
 * 🚨 **IT SHIPS AT 0, AND THE ZERO IS THE RESULT, NOT AN OVERSIGHT.** Everything above is sound
 * for ONE blow and is measurably not enough for a CRATER — see `GRAIN` for the numbers and for
 * what replaces it. The code and the argument are kept because the next round will otherwise
 * propose this again: it is the obvious lever, it is the one the slice named, and it does not
 * work for the stated reason. Turning it on costs nothing and is one number away.
 */
export const LOBE = 0;

/**
 * ⚠️ **THE FIRST ATTEMPT TO RESCUE `LOBE`, KEPT BECAUSE IT IS THE OBVIOUS ONE AND IT ONLY HALF
 * WORKS.** Metres of wall over which blows share a lobe orientation.
 *
 * A crater is forty blows, not one. With the phases drawn per blow, forty independently-oriented
 * lobed patches union into something very nearly round again: every blow's bay is some other
 * blow's headland, and the envelope averages back out. Hashing the phase off a LATTICE OF THE WALL
 * instead makes neighbouring blows break the same way, so their bays should reinforce — and
 * measured, it lifts the FLOOR (the shallowest of 15 craters went 6.3 cm -> 14.3 cm at amplitude
 * 0.75) without lifting the median much, because the wobble is still expressed in each blow's own
 * polar frame and only the phase is shared.
 *
 * `GRAIN` is the same idea taken all the way: put the displacement itself on the wall, and the
 * blow's frame stops mattering at all.
 */
export const LOBE_CELL = 0.55;

/**
 * 🎯 **THE WALL'S GRAIN — and this, not the per-blow lobes, is what makes the crater non-convex.
 * IT IS A CORRECTION TO THE SLICE I WAS GIVEN, AND IT IS MEASURED.**
 *
 * The brief for this round was *"give the brush per-blow angular irregularity … then the union of
 * blows is no longer a union of discs"*. Built and swept, and the second half does not follow.
 * **A per-blow angular wobble is defined in the BLOW'S OWN POLAR FRAME, so it does not tile:** the
 * bay blow A leaves at bearing 40 degrees is filled by blow B, 30 cm away, whose own bay is
 * somewhere else entirely. Measured on `chunk-thick.mjs`'s crater drive, 15 craters,
 * `harness/_tmp_lobeshape.mjs`:
 *
 *   | brush | convexity | median notch | shallowest of 15 |
 *   |---|---|---|---|
 *   | disc (shipped) | 0.9943 | 3.4 cm | 1.3 cm |
 *   | per-blow lobes 0.36 | 0.9822 | 8.2 cm | 2.7 cm |
 *   | per-blow lobes 0.75 (a brush reaching 1.0 m) | 0.9491 | 14.6 cm | **6.3 cm** |
 *
 * — the median creeps up and the FLOOR barely moves, so a given crater is still a coin toss, and
 * the deliverable is one image.
 *
 * **The fix is to define the displacement on the WALL instead of on the blow.** `grain` is a
 * two-octave field in metres, fixed to the face, and the brush treats the cell at `(x, y)` as
 * though it were `grain(x, y)` metres further out. Every blow is displaced identically at the same
 * place, so their bays land on top of one another and REINFORCE however many blows land — the
 * crater's outline follows the grain's own contours at full amplitude, not at the averaged-out
 * fraction a per-blow term survives at.
 *
 * ⚠️ **AND IT ESCAPES THE ARITHMETIC THAT KILLED EVERY SHADER ROUTE.** Round 7's proof was that a
 * THRESHOLD perturbation moves a boundary by (perturbation)/(depth gradient), and against the
 * measured 1.7 per metre `uPlate`'s whole range buys 5.4 cm. This is not a threshold perturbation:
 * it is a geometric displacement of the material itself, so a 0.15 m grain moves the contour 0.15
 * m at every band at once, with no gradient in the denominator.
 *
 * 🚨 **A HARD SPOT IS HARDER TO REACH, NOT IMMUNE — AND THAT IS WHAT PROTECTS THE DIG BAND.** A
 * cell with `grain = +0.15` only takes material from blows centred inside `R - 0.15`, so it
 * survives glancing work — but a blow landed ON it still deposits 92% of centre value
 * (`shape(1 - 0.15/0.52)`), because `RIM`'s floor does not care where the rim is. So the player's
 * own heuristic (`RESIST`: swing at what is still standing) clears it, and the cost is blows spent
 * where the material is, which is the mechanic rather than a tax on it.
 *
 * ⚠️ **PRE-COMPUTED PER CELL AT CONSTRUCTION, ONCE.** It is a pure function of position on the
 * face, so it costs one array and nothing per blow — and `replay()` reproduces it for free,
 * because there is no per-blow state in it at all.
 *
 * ⚠️ **THE SAME FACE ALWAYS BREAKS THE SAME WAY, AND THAT IS CORRECT.** It is a material property,
 * exactly like the baked `tBreakField` every wall in the house already shares. Two holes on one
 * wall look different because they are at different places in the grain, which is also why a hole
 * cannot be memorised into a technique.
 *
 * ---------------------------------------------------------------------------
 * 🧩 **AND IT IS A PLATE LATTICE, NOT SMOOTH NOISE — WHICH IS THE SECOND THING MEASUREMENT
 * OVERTURNED THIS ROUND.**
 * ---------------------------------------------------------------------------
 * The first build of this term was two octaves of value noise. Swept to 0.32 m RMS it reached the
 * 20-30 cm the brief asks for (median notch 18.4 cm, convexity 0.960) **and it still looked
 * wrong**, because a smooth displacement makes a smooth boundary: the crater came out as a
 * cumulus cloud with one bay in it, and it inflated the hole by half a square metre getting there.
 *
 * `refs/dig/dig-gallery-sledge-crew.webp` is not a cloud. Its breach outline is a **jagged
 * polyline**: straight runs 20-40 cm long meeting at sharp corners, with V-shaped notches and
 * pointed white teeth standing into the teal — and the cracked panel on the right of the same
 * frame shows why, because it is plainly made of angular polygonal fragments. Plaster does not
 * erode; it snaps in plates.
 *
 * So the field is a warped integer lattice hashed to a CONSTANT per cell — the same construction
 * `breakmask.js` `_bcell` uses, for the same stated reason (*"the warp is nearly uniform over one
 * cell and therefore TRANSLATES cells rather than curving their edges — irregular polygons with
 * straight-ish walls"*) — but expressed in METRES OF MATERIAL rather than in threshold units. That
 * is the whole difference between this and round 7: `uPlate` had the right shape and 5.4 cm of
 * reach; this has the same shape and reaches as far as it is told to, because it displaces the
 * material instead of perturbing a threshold.
 *
 * Two scales, like `_bgPlate`: the piece that comes away whole, and the pieces it snaps into.
 *
 * ⚠️ **AND `_smooth()` HAD TO STOP BLURRING ACROSS A PLATE WALL** or a 11 cm blur rounds every
 * corner off a 24-46 cm plate and the whole thing comes back as a scalloped cloud. See there —
 * it is the single change that took the median notch from 15 cm to 37 cm at the same amplitude.
 *
 * ---------------------------------------------------------------------------
 * 📊 **WHAT IT IS WORTH, ON THE DELIVERED IMAGE, SAME STATION AND SAME DRIVE**
 * ---------------------------------------------------------------------------
 * `harness/_tmp_outlineconvex.mjs` scores the PNG a critic looks at, not the field. Two full runs
 * of `chunk-thick.mjs` on seed s4, identical in every respect but this constant:
 *
 *   | frame | GRAIN 0 | GRAIN 0.115 |
 *   |---|---|---|
 *   | thick-8 head-on | convexity 0.932, deepest bay 33 px | **0.914, 84 px** |
 *   | thick-12 three-quarter | 0.929, 30 px | **0.900, 66 px** |
 *   | thick-16 identification | 0.931, 25 px | **0.902, 59 px** |
 *
 * i.e. the deepest re-entrant notch is **2.4-2.5x deeper** at every station, and it is 13-17% of
 * the hole's own width where it was 6%. ⚠️ Both arms report `clipped: true` — the breach runs off
 * the top of the frame at every one of `chunk-thick`'s stations, so part of the outline is not in
 * the measurement. The comparison is like-for-like; the absolute numbers are a lower bound.
 *
 * ⚠️ **THE HONEST COST, MEASURED: the white rim is thinner.** `chunk-thick`'s own white fraction on
 * thick-12 goes **2.34% -> 2.09%**. The plate-keyed blur steepens the depth gradient at a plate
 * wall, and the white band's width is (the gap between the skin's and the shell's thresholds) over
 * that gradient — so the rim narrows exactly where the outline gets its corners. It is a trade
 * between a wide even halo and a hard varied edge, and a critic should say which it wants.
 */
export const GRAIN = 0.115;

/**
 * 🐞 **THE UNSUPPORTED-PLATE RULE — see `_shed()` for the ablation that put it here rather than
 * in `breakmask.js`, where two rounds looked for it.**
 *
 * `SHED_R` is the closing's radius in CELLS (a cell is ~9.4 cm), so 2 fills a pit up to about
 * four cells — 38 cm — across and nothing larger. That is one `GRAIN` plate (24-46 cm), which is
 * the size of the thing that gets stranded; a bigger element would start filling the crater's own
 * re-entrant notches, which are the raggedness `critic-dig-5` logged as done.
 *
 * `SHED_AT` is how far a neighbour must be dug before it counts as "gone" for the purpose of
 * supporting nothing. The white shell's tear is at a raw depth of about 0.24; 0.55 is well past
 * it, so a plate is only shed when the material all round it has been taken most of the way
 * through the wall — never merely because the surrounding paint has been knocked off.
 *
 * Set `SHED_R` to 0 to ablate the whole pass.
 *
 * 🚨 **SHIPPED AT 0 — INERT — AND THE REASON IS A MEASUREMENT, NOT A CHANGE OF MIND.** The rule
 * was built to remove the white island, on the hypothesis that the island is a plate stranded by
 * the plate-keyed blur. **The census refutes it: there is no pit in `depth` at all.** Counting
 * cells under a raw depth of 0.30 whose whole ring at radius r is past 0.55, on the crater
 * `_chunks11-secab.mjs` digs, on the face `chunk-thick` shoots:
 *
 *   | ring radius | 2 | 3 | 4 | 6 |
 *   |---|---|---|---|---|
 *   | pits found | **0** | **0** | **0** | **0** |
 *
 * `_shed()` correctly raised nothing (`shedRaised` 0 of 168 candidate cells, every one rejected
 * by the ring guard), and the island did not move: 1132 px with the pass on, 1126-1130 px with
 * it off. **The depth field is not where it lives.** It is kept, at 0, because the RULE is right
 * and cheap if a pit is ever measured — and because writing it down at 0 stops the next round
 * re-deriving the same wrong fix, which is the third time this defect has been mis-attributed.
 */
export const SHED_R = 0;
export const SHED_AT = 0.55;

/**
 * 🐞 **ROUND 10: THE WHITE ISLAND, AND AFTER FOUR ROUNDS OF MIS-ATTRIBUTION IT IS THIS FILE'S,
 * NOT `breakmask.js`'s. IT WAS FOUND BY A CAMERA->PIXEL RAYCAST, WHICH NOBODY HAD RUN ON IT.**
 *
 * `harness/scenarios/_chunks12-island.mjs` picks the blob and reads the damage field at the
 * winning uv. The island's own cell is at raw depth **0.00** — untouched wall — and the grain
 * map explains exactly which cells those are. The 5x5 neighbourhood, `depth/grain`, on the
 * crater `chunk-thick` shoots:
 *
 *     0.47/-0.177  0.50/-0.134  0.63/-0.134  0.44/+0.073  0.48/+0.073
 *     0.55/-0.148  0.00/+0.098  0.00/+0.098  0.41/+0.073  0.43/+0.073
 *     0.24/-0.142  0.57/-0.142  0.00/+0.105  0.00/+0.105  0.40/+0.073
 *     0.22/-0.142  0.55/-0.142  0.84/-0.142  0.17/+0.105  0.17/+0.105
 *     0.00/+0.147  0.17/+0.147  0.18/+0.147  0.80/-0.022  0.94/-0.022
 *
 * **Every cell at depth 0 has a POSITIVE grain and every cell that went through has a negative
 * one.** The mechanism is the one `cap`'s own note above already describes — *"a hard plate only
 * takes material from blows centred inside R - g, so the extreme tail is a patch a wandering dig
 * can miss entirely"* — and the 1.75-RMS cap was the fix for it. **The cap does not reach this
 * one: +0.105 is 0.9 RMS, nowhere near the 0.201 cap.** Clamping harder is not available either,
 * because the bays the outline is made of are ~1 RMS features, i.e. the same size as the thing
 * that strands.
 *
 * So the resistance stops being a RANGE TEST and becomes a FLOOR. A hard plate inside the
 * brush's true radius always takes something; it just takes `RIM * GRAIN_FLOOR` of it instead of
 * the profile's own value — at 0.28 that is a seventh of what its soft neighbour takes, so it is
 * still plainly the hard bit of the wall, but it can no longer sit at literally zero while the
 * material all round it is torn through.
 *
 * ⚠️ **IT CANNOT GROW THE HOLE.** The floor is gated on `r0 < R`, the cell's TRUE distance from
 * the blow, so the brush's reach is unchanged and only cells the blow already covered are
 * affected. And it is gated on `grain > 0`, so a soft plate — which is what bulges the outline
 * outward — is untouched in either direction.
 *
 * ⚠️ **IT CAN ONLY MAKE THE DIG FASTER, SO THE BAND HAD TO BE RE-MEASURED, NOT ARGUED.**
 * `dig-free.mjs` is the gate and it was re-run. On the reference crater the whole field moves
 * mean depth **0.153 -> 0.157** across 45 identical blows, i.e. the floor is worth a quarter of
 * one per cent of the material — it reaches only the few cells the range test was excluding.
 *
 * 📊 **WHAT IT IS WORTH, ON THE DELIVERED FRAMES** (`critic-dig-6`'s own island detector,
 * `harness/_critic6_islands.mjs`, run over `chunk-thick`'s evidence set before and after):
 *
 *   | frame | islands, floor 0 | islands, floor 0.28 |
 *   |---|---|---|
 *   | thick-8 head-on | 508 px | 227 px (and it is RUBBLE, not wall — zoomed) |
 *   | thick-9 graze | 627 px | **23 px** |
 *   | thick-10 graze far | 387 px | **24 px** |
 *   | thick-11 steep graze | 1329 px | **0** |
 *   | thick-12 three materials | 364 px | **0** |
 *   | thick-13 head-on far | 475 px | 195 px (the same rubble) |
 *   | thick-14 three-quarter | 859 px | **0** |
 *   | thick-16 identification | 453 px | **81 px** |
 *   | thick-17 cut section | 2086 px | **0** |
 *
 * …and the outline's mean second difference, which is the raggedness every previous island fix
 * died on, is **16.35 -> 16.30 px** at the graze and 2.66 -> 2.24 head-on. It does not move.
 *
 * Set to 0 to ablate: the range test comes back exactly, to the bit.
 */
export const GRAIN_FLOOR = 0.28;
/** Plate sizes in metres. `refs/_sheets/dig.png` breaks in 20-50 cm fragments; this brackets it. */
export const GRAIN_SCALE = [0.46, 0.24];

/** Cell states. A cell is passable only when it is BOTH dug through AND has nothing behind it. */
export const OPEN_AT = 0.999;

/**
 * 🧱 **UNSUPPORTED WALL COMES DOWN — AND IT IS A SKILL MECHANIC, NOT AN EFFECT.**
 *
 * John, 2026-08-09, after playing:
 *
 *   > *"I also want some extra pieces to break off if much of the wall has already been cleared
 *   > around it… like the Teardown game with the extra chunks flying off because it's no longer
 *   > supported by the rest of the structure. **This could create an efficiency for the player to
 *   > utilize as a skill to differentiate themselves. how effectively they can break down large
 *   > segments with the least hits.**"*
 *
 * 🚨 **AND IT IS NOT A LOCAL TEST EITHER — JOHN CORRECTED THAT ON 2026-08-10, AFTER PLAYING IT.**
 *
 *   > *"It does collapse everything unsupported but I think it **should not collapse the entire
 *   > wall from just hitting the bottom once in 1x dig mode**. I think instead when we blow
 *   > through and the below feels unsupported it should **also consider structural integrity of
 *   > the other connected parts of the wall**, and when **that falls below a certain threshold**
 *   > that's when **the collapse chains**."*
 *
 * 🚨 **THIS IS NOT `docs/design/disconnection.md`'s FLOOD FILL EITHER, AND THE DIFFERENCE IS ONE
 * WORD.** That design floods the SURVIVING material and drops what is fully severed; it is
 * measured to fire on nothing — a radial dig never severs an island, because the border ring of
 * a span is always intact and everything is still connected to it through the rim (7 cells in 220
 * blows, `debris-collapse.mjs` C1). **`support.js` floods the HANGING material instead**, and
 * that set is hundreds of cells from the first through-blow.
 *
 * **Poorly SUPPORTED is not the same thing as DISCONNECTED.** A slab of wall standing over a hole
 * is still connected to the house through its own two ends and it is still going to fall down. So
 * the rule is an ARCH, not a graph of what is left:
 *
 *  1. **THE COURSE — the small, frequent one.** A run of hole wider than `span` cannot be arched
 *     over locally, so the one course of material directly above it comes away. It does NOT
 *     cascade; this is the crater eating upward a hand's width at a time.
 *  2. **THE ARCH — the one the skill lives in.** Material with a hole anywhere beneath it in its
 *     own column is *hanging*: carried sideways to the piers rather than standing on the ground.
 *     Every connected region of hanging material is weighed — `fail` m² of original wall — and
 *     while it is under the threshold the arch holds. Once it is over, **that whole region comes
 *     down in one event**, in waves, until the wall stops moving. That is the chain.
 *  3. **THE LONELY RULE — the "extra pieces".** A cell with `lonely` of its eight neighbours
 *     already gone drops out too. This is small, it fires all through a dig, and it is what makes
 *     the crater's edge shed chips as it grows instead of ending in a clean arc.
 *
 * 🎯 **WHY IT IS LEARNABLE, WHICH IS THE DIFFERENCE BETWEEN SKILL AND LUCK.** The rule has two
 * sentences — *a wall arches over its holes, and when too much of it is hanging the arch gives* —
 * and the player can watch it happen and form exactly that theory. Hammering ONE SPOT stalls: the
 * hanging load measured on the shipped grid **plateaus at 1.82 m² and never moves again**, so no
 * number of blows at one place will ever bring the wall down. Widening a low cut takes it from
 * **2.34 → 3.18 → 4.38 m²** and the storey goes on the third blow. Two players spending the same
 * blows get visibly different walls, and the difference is *width*, not depth.
 *
 * ⚠️ **THE CYAN DOES NOT HOLD THE WHITE UP, AND THAT IS WHAT KEEPS THE SEARCH SECRET.** A cell
 * backed by the indestructible barrier counts as *gone* for both rules once the destructible
 * material in front of it has been removed. Treating the barrier as support would have been the
 * intuitive choice and it is a trap: the interconnect is the one region with NO barrier behind
 * it, so a collapse that only fired where there is no cyan would announce the way through on its
 * first firing. `dig.md` §5 — *the search is the game*. Collapses happen equally over cyan and
 * over the interconnect, so a collapse tells the player nothing except that they aimed well.
 *
 * ⚠️ **IT WRITES `depth`, SO EVERYTHING FOLLOWS IT.** Cells brought down by a collapse are gone
 * for the shader, for `solidRects()`, for sight and for `pathPortals()` — one grid, every
 * consumer, which is what `chunks-1` built this field for. **A collapse can therefore open a
 * route nobody dug**, and that is intended; `debris-collapse.mjs` C4 asserts the graph and the
 * picture still agree.
 *
 * ⚠️ **DETERMINISM.** Every rule is a pure function of `depth`, which is a pure function of the
 * hit list, and they run inside `_add()` — the field's ONLY writer — so `replay()` reproduces
 * every collapse bit-for-bit. No rng, no time term, nothing on the wire.
 *
 * Set `fail` to 0 to ablate the arch, `span` to 0 to ablate the course rule and `lonely` to 9 to
 * ablate the other; all are instance-overridable (`field.collapse = {...}`) so an A/B is an arm,
 * not a rebuild.
 */
export const COLLAPSE = {
  /**
   * 🎯 **THE THRESHOLD JOHN ASKED FOR: m² OF ORIGINAL WALL ONE CONNECTED HANGING REGION MAY
   * CARRY BEFORE THE ARCH GIVES.** This is the number the whole mechanic turns on.
   *
   * ⚠️ **IT IS AN AREA IN m², NOT A FRACTION OF THE FACE, AND THAT IS MEASURED RATHER THAN
   * chosen.** A fraction makes a narrow face collapse from proportionally less damage: one bottom
   * blow hangs **14.7% of a 5.72 m face and 35.1% of a 2.56 m one**, so a 26%-of-face threshold
   * would have taken a small wall down on a single hit while leaving a big one standing. In m²
   * the same blow hangs **2.34 and 2.52** — the mass over a 1.04 m hole is the mass over a 1.04 m
   * hole, whatever wall it is cut into.
   *
   * 📐 **SWEPT ON THE SHIPPED GRID, BOTH ARMS OF THE `[ ]` LADDER** (headless against the real
   * `DamageField`, collapse applied in the loop so later blows see the wall it left):
   *
   *   | drive | hanging load, m², blow by blow | at 3.40 |
   *   |---|---|---|
   *   | ×1 undercut, one low line | 2.34 · 3.18 · **4.38** · 5.95 | fires on blow **3** |
   *   | ×1 hammering ONE SPOT | 1.82 · 1.80 · 1.79 · 1.78 … | **never** |
   *   | ×1 a minimum body channel, dug upward | 2.26 · 2.04 · 1.82 · 1.62 … | **never** |
   *   | ×0.125 undercut (the pre-2026-08-09 game) | reaches 3.4 at blow 30 | fires on blow **30** |
   *   | ×0.125 hammering one spot | plateaus at 1.08 | **never** |
   *
   * 🎯 **AND THAT IS WHY THE THRESHOLD IS AN AREA AND NOT A SPAN: IT MAKES THE TWO ARMS AGREE.**
   * At ×0.125 the brush is 0.63 m across against ×1's 1.04, so no run of hole a ×0.125 player
   * makes ever reaches a 1.45 m SPAN and the old rule was simply dead on that arm. A load
   * threshold is in metres of wall removed, not in blows, so **the same strategy — cut low, cut
   * wide — works on both, at 30 blows instead of 3.** That is the asymmetry this round was asked
   * to reduce, and it is reduced to the pacing multiplier itself.
   *
   * 🚨 **THE THREE PROPERTIES IT IS SET AGAINST:**
   *  1. **ONE BLOW MUST NOT DO IT** — John's own sentence. One bottom blow at ×1 hangs 2.34 m²,
   *     69% of the way, so the wall crazes hard and stands.
   *  2. **HAMMERING ONE SPOT MUST NEVER DO IT.** A round crater's hanging load plateaus, because
   *     the brush stops removing material long before the column above it grows. 1.82 m² is the
   *     ceiling and it is 54% of the threshold.
   *  3. **A MINIMUM BODY CHANNEL MUST NOT TRIGGER IT.** `channel()` needs 0.68 m and a wandering
   *     dig opens 0.74–0.83. Digging one UPWARD *reduces* the hanging load — the material above
   *     is what you are removing — so it peaks at 2.26 m² on its first blow and falls from there.
   */
  fail: 3.40,
  /**
   * Metres of unsupported horizontal run that sheds the ONE COURSE directly above it.
   *
   * ⚠️ **IT NO LONGER CASCADES, AND THAT IS THE DEFECT JOHN REPORTED.** Under the rule this
   * replaces the same sweep ran bottom-up with the cascade always live, so the row that fell was
   * the missing support for the row above and one undercut unzipped the whole storey on the first
   * through-blow. The course rule now reads `arch()`'s **un-cascaded** run (`w0`), computed
   * against `depth` as it stood at the top of the wave, so it can only ever take one course. The
   * storey is the ARCH's job and the arch has a threshold in front of it.
   *
   * 🚨 **1.45 m IS KEPT AND THE REASON IS STILL THE ×8 PACING.** At `DIG_BASE` 8 a single blow
   * deposits `0.31 × 8 × RIM` = 1.54 at its own rim, i.e. **it takes its whole 1.04 m brush clean
   * through in one hit** — 11 cells. 1.45 m is 15–16 cells, so a first through-blow gets ~69% of
   * the way and crazes, and a second beside it sheds the course. A rule that resolves inside one
   * blow cannot be watched, and *if collapses look random there is no skill, only luck.* It also
   * keeps property 3 above: 1.45 is comfortably clear of the 0.83 m a wandering dig opens.
   */
  span: 1.45,
  /** Depth at which a cell is a hole and holds nothing up. Just under `OPEN_AT`. */
  gone: 0.985,
  /**
   * 🕸️ **WHERE THE WALL STARTS TO SHOW IT — the strain tell, as a fraction of BOTH thresholds.**
   *
   * It is a FRACTION and not a second number so that the tell tracks the rule automatically:
   * move `fail` or `span` and the warning moves with it, and there is nothing to forget.
   *
   * 0.45 is set against the brush, not by eye. **One through-blow at ×1 hangs 2.34 of the 3.40 m²
   * the arch can carry, i.e. 69% of the way**, so the foot has to sit below that or a first blow
   * says nothing at all — and it lands at `(0.69 - 0.45) / 0.55` = **0.44 of full crazing after
   * one blow**, deepening as the region grows and reaching 1 just as the wall lets go. Higher and
   * the crack and the collapse arrive on the same blow (a flash, not a tell); much lower and the
   * whole face crazes the moment anything goes through, which is a change of material rather than
   * a warning. The course rule's own band uses the same fraction of `span`, for the same reason.
   */
  nearFrac: 0.45,
  /** How many of the eight neighbours must be gone before a lone cell drops out. 9 disables. */
  lonely: 6,
  /**
   * 🔗 **HOW MANY TIMES ONE BLOW MAY RE-WEIGH THE WALL — the chain, bounded.** A region coming
   * down widens the hole under whatever is beside and above it, so the sweep re-runs on the wall
   * the last wave left. It is self-limiting rather than capped by taste: dropping hanging
   * material REMOVES load, so a face that sheds its overloaded region usually weighs in under
   * `fail` on the next wave and stops. Measured, two waves is the common case and three is the
   * most anything reached; the loop exits the moment a wave takes nothing.
   */
  waves: 4,
  /**
   * Cells one blow may bring down. ⚠️ **RAISED 520 → 1100 WITH THE ARCH, AND IT HAD TO BE.** The
   * old rule dropped rows, so a big event was a few hundred cells; the arch drops a whole
   * connected region, and a fully undercut 5.72 m face is ~1600. At 520 the cap became the rule
   * rather than a guard against a pathological cascade — it would have sliced the bottom off
   * every storey and left the top hanging for the next blow. Reported when it bites so it can
   * never quietly become the rule again.
   */
  cap: 1100,
  /**
   * 🧱 **THE SAG — THE ARCH GIVES IN STAGES AND THE REGION HANGS BETWEEN THEM.** `false` restores
   * the round-13 rule bit-for-bit (whole region, one event, in waves) and is the ablation arm every
   * instrument runs as its control. The whole design is in `support.js`'s header; the three
   * numbers it needs are below.
   */
  sag: true,
  /**
   * 🎯 **HOW MUCH WALL ONE SWING MAY PULL DOWN, IN m² OF ORIGINAL WALL.** This is the number that
   * turns *"the whole structure above collapses in one moment"* into *"bit by bit"*, and it is set
   * against `fail` rather than by eye: at 1.40 the canonical chained storey (4.30–4.38 m²) comes
   * away in **three** bites — one on the blow that breaks the arch, two more on the blows that pull
   * it — so the biggest single event a skilled dig produces goes from **408 cells to ~157** and the
   * storey costs 5 blows instead of 3.
   *
   * ⚠️ **IT IS AN AREA FOR THE SAME REASON `fail` IS** (see above): a fraction of the region would
   * make a big collapse arrive in the same number of pieces as a small one, which is the uniformity
   * complaint restated. In m², a 1.6 m² arch failure comes down in one bite and a 6 m² storey in
   * four — **the payout's grain is constant and its LENGTH scales with what you brought down.**
   *
   * ⚠️ **A remainder under 1.20 x this comes away whole**, so a region never stops a crumb short of
   * gone and no sliver of sag can hang for ever. 0 ablates the bite (the whole region on the pull).
   */
  bite: 1.40,
  /**
   * How far a blow's own brush radius reaches when deciding whether it PULLED a sagging region.
   * 1.35 x the 0.52 m brush is 0.70 m: standing at the piece and swinging at it pulls it, a swing
   * at the far end of a 5.72 m face does not. It is in brush radii and not metres so it tracks the
   * `[ ]` ladder — a ×0.125 player has a smaller brush AND a shorter reach, which is the same
   * trade the rest of that arm makes.
   */
  pullReach: 1.35,
  /**
   * 🚨 **THE ESCAPE VALVE, AND IT IS NOT OPTIONAL.** A sagging region that is never touched again
   * would hang for ever — `critic-dig-8`'s stated risk on this direction, *"a wall that has been
   * about to fall for ten minutes… it needs a decay or it becomes scenery."* A decay would need a
   * time term, and this file has none by contract, so the bound is in LOAD instead: keep making a
   * sagging region heavier and at `pullFree x fail` it lets go without being asked. On the shipped
   * ladder that is 5.95 m², which the undercut reaches on its fourth blow — so a player who works
   * around a hanging piece still gets it, and a player who walks away still owns the decision.
   */
  pullFree: 1.75,
  /**
   * 🚪 **A DOORWAY HAS A LINTEL AND A HOLE YOU SMASHED DOES NOT. THAT SENTENCE IS THIS FLAG.**
   *
   * `DamageField.setApertures()` makes a doorway `depth = 1`, which is exactly right for every
   * consumer in the project except one: the COURSE rule reads *"a run of REAL HOLE wider than
   * `span` sheds the one course directly above it"*, and a 2.08 m doorway is 22 cells against
   * `span`'s 15. **So the first blow anywhere on a face would shed the course over every doorway
   * in it, and the next blow the course above that** — the head of every door in the house eaten
   * away by damage a room and a half distant, for no reason a player could ever form a theory
   * about.
   *
   * 🎯 **AND THE FIX IS NOT "EXEMPT THE DOORWAY", IT IS ONE HALF OF THE SWEEP.** `arch()` asks
   * two questions and only one of them changes:
   *
   *   · the COURSE (`w0`, un-cascaded) — a doorway is SUPPORTED. Its head is carried by a beam
   *     bearing on the two jambs, which is what a lintel is, so nothing sheds over it.
   *   · the ARCH (`w`, cascaded) — a doorway is a HOLE. The material above it is hanging,
   *     carried sideways to the jambs, and it joins the connected hanging region like any other
   *     overhang.
   *
   * **So undercutting BESIDE a doorway still brings its lintel down, and that is the Teardown
   * moment arriving from a rule that already existed rather than from a new one.** Set `false` to
   * ablate: a doorway then reads as a raw hole to both rules and the course over it sheds on the
   * first blow. That arm is the control `_ap2-rule.mjs` runs on every run.
   */
  lintel: true,
};

const TAU = Math.PI * 2;

/**
 * A 32-bit integer hash -> 0..1. Pure and allocation-free; see `LOBE` for why the brush's shape
 * may not come from any other source of variation.
 */
function lobeHash(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise on an integer lattice, 0..1. Only the plate lattice's WARP; see `GRAIN`. */
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = lobeHash(xi, yi), b = lobeHash(xi + 1, yi);
  const c = lobeHash(xi, yi + 1), d = lobeHash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * 🧩 A PER-PLATE CONSTANT over a warped integer lattice, 0..1 — see `GRAIN`. Constant inside a
 * plate, discontinuous at its walls, and the walls are straight-ish because the warp is sampled at
 * half the lattice frequency and so is nearly uniform across one cell. This is `breakmask.js`
 * `_bcell` on the CPU, in metres of material instead of in threshold units.
 */
function plateAt(x, y, salt) {
  const wx = vnoise(x * 0.53 + 7.0 + salt, y * 0.53 + 7.0) - 0.5;
  const wy = vnoise(y * 0.53 + 29.0, x * 0.53 + 29.0 + salt) - 0.5;
  return lobeHash(Math.floor(x + wx * 1.15), Math.floor(y + wy * 1.15));
}

/**
 * A rectangular destructible face, gridded.
 *
 * Local UV convention matches the layer planes exactly: u 0..1 runs along `width` from the
 * panel's local -x to +x, v 0..1 runs along `height` from local -y to +y. `PlaneGeometry`'s own
 * uv attribute is (0,0) at the bottom-left corner, so cell (0,0) is the bottom-left of the face
 * as seen from the room that owns it, and `THREE.DataTexture`'s first row is that same bottom
 * row (three does not flip DataTexture, unlike an image).
 */
export class DamageField {
  /**
   * @param {object} o
   * @param {number} o.width   metres, along the face
   * @param {number} o.height  metres
   * @param {number} [o.cell]  metres per cell
   */
  constructor(o = {}) {
    this.width = o.width ?? 5.72;
    this.height = o.height ?? 2.80;
    this.cell = o.cell ?? CELL;
    /**
     * ⚠️ **EVEN, ALWAYS — AND IT IS NOT TIDINESS, IT IS THE TWIN.**
     *
     * The two faces of one wall band run in OPPOSITE directions, so a breakthrough is mirrored
     * cell for cell (`wall.js` `_couple`, `mirrorBarrierFrom`) — column `cx` maps to
     * `cols-1-cx`. When `_macro` quantised to 2-cell columns, an ODD column count landed that
     * mirror half in one macro column and half in the next: a macro cell fully open on one face
     * was 50% open on the other, under the threshold, and still collided. Measured in-game
     * before this line existed — the hole was open, `blocksMovement()` said so, and a body
     * driven at it stopped **0.18 m short, held by the TWIN's collider**.
     *
     * ✅ **`_macro` IS 1 CELL NOW, SO THE MIRROR IS CELL-FOR-CELL AND THIS CANNOT FIRE AT ALL.**
     * The line stays because it costs nothing and because `MACRO` is kept ablatable.
     *
     * 🔎 **AND IT IS WHERE A WRONG DIAGNOSIS CAME FROM, SO THE MEASUREMENT IS WRITTEN DOWN.**
     * `digband-1` filed the `service`/`s7` softlock as *"`mirrorBarrierFrom` preserves barrier
     * cells but not their alignment on `_macro`'s 2-cell lattice, and the parity flips in the
     * mirror."* **Half true and not the cause.** The phase DOES flip — on any row whose
     * barrier-free run has ODD length, because `cols` is even so the mirrored run starts at
     * `cols - c0 - L` — but it buys nothing either way, and both halves of that were measured on
     * the twins of `f.svc_w.0` at `s7`:
     *
     *   · the count of fully-clear macro columns is **identical on every row of both faces**
     *     (an odd-length run yields `(L-1)/2` at either phase; an even-length run keeps its
     *     phase across the mirror because `cols` and `L` are both even);
     *   · `channel()` with every cell driven to depth 1.0 reads **0.740 m on BOTH faces**.
     *
     * The twins really did behave differently — 46 blows against 406 — but the asymmetry was in
     * the DRIVE, not the barrier: `dig-band.mjs` aims inside `[bestA+1, bestA+9]` of a 10-cell
     * band, so it never lands a blow on the band's first column, and which twin that starves
     * depends on which side the load-bearing macro column falls — which the mirror does flip.
     * See `_macro` for the defect that made a starved column fatal instead of merely slow.
     */
    const even = (v) => Math.max(4, 2 * Math.round(v / 2));
    this.cols = even(this.width / this.cell);
    this.rows = even(this.height / this.cell);
    /**
     * The brush, as data rather than as constants baked into `_add`. It is a knob because
     * John's band is a MEASURED target and the only honest way to hit a band is to be able to
     * sweep the thing that moves it — `harness/scenarios/dig-free.mjs` and the headless sim both
     * drive these. Defaults are the shipped values.
     */
    this.brush = {
      strength: o.brush?.strength ?? STRENGTH,
      resist: o.brush?.resist ?? RESIST,
      radius: o.brush?.radius ?? BRUSH_R,
      rim: o.brush?.rim ?? RIM,
      /** see `LOBE`. 0 is exactly the old disc, to the bit. */
      lobe: o.brush?.lobe ?? LOBE,
      /** see `LOBE_CELL`. Metres of wall over which blows share a lobe orientation. */
      lobeCell: o.brush?.lobeCell ?? LOBE_CELL,
      /** see `GRAIN`. 0 is exactly a straight radial brush. */
      grain: o.brush?.grain ?? GRAIN,
      /**
       * 🚨 see `DIG_BASE`. The base dig speed, as a multiplier on `strength` at the deposit.
       * Kept OUT of `strength` itself so every measured figure in this file's headers — the
       * 0.31, the closed-form 0.1942 m²·depth, `GRAIN`'s area bias — still reads against the
       * number it was measured at, and so `--strength` in the headless sim still means what it
       * has always meant. 1 is the pre-2026-08-09 pacing, to the bit.
       */
      base: o.brush?.base ?? DIG_BASE,
    };
    const n = this.cols * this.rows;

    /**
     * 🎯 THE WALL'S GRAIN, IN METRES OF RADIAL DISPLACEMENT, ONE VALUE PER CELL — see `GRAIN`.
     * Built once here because it is a pure function of position on the face: it costs nothing per
     * blow, and `replay()` gets it for free because there is no state in it.
     *
     * ⚠️ **THE OCTAVES ARE IN METRES, SO THE GRAIN IS ISOTROPIC AND SPAN-INDEPENDENT.** A 2.56 m
     * face and a 5.72 m one break at the same physical size, which is the same argument
     * `wall.js` makes for deriving `plateScale` from the face rather than typing it in cells.
     */
    this.grain = new Float32Array(n);
    /**
     * 🧩 **WHICH PLATE A CELL BELONGS TO — and it exists so `_smooth()` can refuse to blur across a
     * plate wall.** See `_smooth`: a plate wall is a real material discontinuity and is the one
     * edge in this field that must stay hard.
     */
    this.plate = new Int32Array(n);
    if (this.brush.grain > 1e-6) {
      const [g1, g2] = GRAIN_SCALE;
      let sq = 0;
      for (let cy = 0; cy < this.rows; cy++) {
        const y = (cy + 0.5) * (this.height / this.rows);
        for (let cx = 0; cx < this.cols; cx++) {
          const x = (cx + 0.5) * (this.width / this.cols);
          const a = plateAt(x / g1, y / g1, 0.0);
          const b = plateAt(x / g2, y / g2, 13.0);
          const g = (a - 0.5) * 0.66 + (b - 0.5) * 0.34;
          const i = cy * this.cols + cx;
          this.grain[i] = g;
          // the two lattices' hashes ARE the plate identity — two cells agree iff both lattices do
          this.plate[i] = (Math.round(a * 65535) << 16) ^ Math.round(b * 65535);
          sq += g * g;
        }
      }
      /**
       * ⚠️ **NORMALISED TO ITS RMS, SO THE KNOB IS A DISTANCE AND NOT A COEFFICIENT.** Value noise
       * spends almost no time near its extremes: the raw two-octave sum above has a range of
       * +/-0.5 and an RMS of **0.166**, so reading the coefficient as an amplitude over-states the
       * typical displacement by three times, and the first build of this term did exactly that —
       * it was set to 0.155 m and moved the contour by 5 cm, which measured as no change at all.
       * With the field normalised, `GRAIN` is the RMS displacement in metres and the deepest bays
       * are about 2.7x it, which is the number the 20-30 cm target can be aimed at directly.
       */
      const rms = Math.sqrt(sq / n) || 1;
      const k = this.brush.grain / rms;
      /**
       * 🚨 **AND IT IS AREA-NEUTRAL BY CONSTRUCTION, WHICH IS WHY `STRENGTH` AND `BRUSH_R` DID NOT
       * HAVE TO MOVE.** A mean-zero radial displacement does NOT leave the removed area alone: the
       * brush's reach becomes `R - g`, and `<(R - g)²> = R² + <g²>`, so a symmetric grain always
       * takes a bigger bite. Measured: one blow on pristine wall went 0.1953 -> 0.2105 m²·depth,
       * +7.8%, which is the figure `debris.js` scales the chunk count and size by. Biasing the
       * whole field outward cancels it — about 2 cm on a 0.52 m brush, far too small to see in the
       * silhouette and precisely the size of the error.
       *
       * ⚠️ **THE COEFFICIENT IS 1.0 AND NOT THE 0.5 THE ALGEBRA GIVES, BECAUSE `RIM` IS A FLOOR
       * AND NOT A CONE.** The `<g²>/2R` above is the exact answer for a profile that goes to zero
       * at the rim; ours deposits 62% of centre value right up to it, so displacing the rim moves
       * a step and not a taper, and the area term is twice as big. Measured rather than re-derived:
       * at 0.5 the per-blow figure sat at 0.2048 against the control's 0.1953, at 1.0 it lands on
       * it. This is a place where the derivation says the SHAPE of the correction and the
       * measurement says the size.
       */
      const bias = (this.brush.grain * this.brush.grain) / this.brush.radius;
      /**
       * 🚨 **THE HARD SIDE IS CLAMPED AND THE SOFT SIDE IS NOT, AND THE ASYMMETRY IS ROUND 4's
       * ISLANDS BEING KEPT OUT.**
       *
       * The two signs do completely different things. A NEGATIVE grain is a soft plate: the brush
       * reaches further there, which costs nothing and bulges the outline outward. A POSITIVE one
       * is a hard plate, and it only takes material from blows centred inside `R - g` — so the
       * extreme tail of the distribution (this lattice reaches 2.7x its own RMS) is a patch that
       * a wandering dig can miss entirely. Measured on the same station and the same drive: the
       * unclamped field left **one white island of ~350 px inside the teal in all three
       * deliverable frames**, and *"an aerial photo of a lagoon with small islands"* is the exact
       * sentence that rejected round 4.
       *
       * 1.75 RMS keeps every bay the outline is made of — they are ~1 RMS features — and removes
       * only the few cells that were unreachable.
       */
      const cap = this.brush.grain * 1.75;
      for (let i = 0; i < n; i++) {
        this.grain[i] = Math.min(this.grain[i] * k + bias, cap);
      }
    }

    /** THE TRUTH. Depth 0..1 per cell. Written only by `_add`. */
    this.depth = new Float32Array(n);
    /** 1 where something impassable stands behind this cell. Written only by `setBarrier`. */
    this.barrier = new Uint8Array(n).fill(1);
    /**
     * 🚪 **1 WHERE THERE IS NO WALL AND NEVER WAS — A DOORWAY, A WINDOW, AN APERTURE.** `null`
     * until `setApertures()` is called, which is every face on every arm but the slab's. See
     * `setApertures` for what it is and, more importantly, for what it is NOT.
     */
    this.aperture = null;
    this.apertures = null;

    /**
     * ⚠️ RGBA8 AND NOT A FLOAT TEXTURE, DELIBERATELY. WebGL2 will sample a float texture but
     * LINEAR filtering of one needs `OES_texture_float_linear`, which is not universal — and a
     * NEAREST-filtered damage field steps the hole edge into 9 cm staircases and throws away
     * the whole reason `breakmask.js`'s baked field exists. 8 bits is 1/255 of depth, four
     * times finer than one blow's smallest increment.
     */
    this.data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) this.data[i * 4 + 1] = 255;   // barrier everywhere, initially
    /**
     * 🚨 **THE B CHANNEL: THE SAME DEPTH, SMOOTHED, AND IT EXISTS ONLY FOR THE RENDERER.**
     *
     * ⚠️ **THE STAIRCASE, AND WHY NOTHING IN THE SHADER COULD FIX IT.** `_add` deposits
     * `RIM + …` right up to `r == R` and exactly nothing at `r > R` (the `d2 >= R2` skip). After
     * a dozen blows at one spot the cells inside the brush are near 1.0 and the cells outside are
     * still exactly 0 — so **the field steps by almost its whole range across ONE 9.4 cm cell**,
     * and every threshold taken against it (each layer's discard, and the barrier's `uShowAt`)
     * lands inside that single cell. A bilinear iso-contour confined to one cell IS a cell:
     * every hole came out as the brush disc RASTERISED, in axis-aligned 9 cm steps with
     * 45-degree corners.
     *
     * Three shader attempts failed against it and the reason is arithmetic rather than tuning: a
     * threshold perturbation of +/-0.2 moves a boundary by 0.2 of the local gradient, and the
     * local gradient here is ~1.0 per cell, so +/-0.2 of a cell — two centimetres. **The
     * raggedness cannot win against a gradient that steep.** It has to be the field.
     *
     * ⚠️ **AND IT MUST NOT BE THE FIELD THE GAME READS.** `depth` is the gameplay truth for
     * collision, sight, routing and the 61-67 s dig band, and softening it would retune all four
     * — `RIM` alone moved a measured breakthrough 255 blows to 34. So the smoothing goes in a
     * SEPARATE channel that only the shader samples: `depth` is untouched, `passable()`,
     * `channel()` and `solidRects()` are untouched, and the band is unchanged **by construction
     * rather than by re-measurement** (re-measured anyway: `dig-free.mjs` reports 63 s after round 8).
     */
    this._blurA = new Float32Array(n);
    this._blurB = new Float32Array(n);
    // 🐞 see _shed: the grayscale closing that lets an unsupported plate fall out
    this._shedA = new Float32Array(n);
    this._shedB = new Float32Array(n);
    this.texture = new THREE.DataTexture(this.data, this.cols, this.rows, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    // ⚠️ A row of `cols` RGBA texels is always 4-byte aligned, but the default unpack alignment
    // is a property of the GL state and this is cheaper than trusting it.
    this.texture.unpackAlignment = 4;
    this.texture.needsUpdate = true;

    /** THE WIRE FORM. See the header: never sync the mask, replay this. */
    this.hits = [];
    this.dirty = false;
    /** Set the first time any cell reaches `OPEN_AT` with no barrier behind it. */
    this.brokeThrough = false;
    this._solids = null;      // cached rectangle decomposition, invalidated by `_touch`
    this._macroCache = null;  // the quantised grid BOTH the collider and `channel()` read
    this._stamp = 0;
    this._maxDepth = 0;
    this._openCells = 0;
    if (o.apertures?.length) this.setApertures(o.apertures);
  }

  /**
   * 🚪 **THE SLAB HAS A HOLE IN IT — `{u0,u1,v0,v1}` FACE-LOCAL, THE SAME 0..1 EVERY OTHER
   * QUERY IN THIS FILE SPEAKS.**
   *
   * John, 2026-08-11: *"lets aperture the doorways into the slab and be able to do it in a known
   * location."* `slab-1` and `doors-1` filed the same blocker independently — a slab has to be
   * able to CONTAIN a doorway or the generator must emit one slab per contiguous run, and
   * `maptool-2` measured that at **63.4% of diggable runs split by a door**.
   *
   * 🎯 **AND IT IS EXPRESSED IN THE ONE THING THAT WAS ALREADY THE TRUTH: `depth` AND `barrier`.**
   * An aperture cell is `depth = 1` (there is no material there) and `barrier = 0` (there is
   * nothing standing behind it). That single sentence is the whole mechanic, because every
   * consumer in the project already reads those two arrays:
   *
   *   `passable()` / `_macro()` / `channel()`   an open doorway is passable, with no new branch
   *   `solidRects()`                            no collider in a doorway, with no new branch
   *   `seeThrough()` / `anySeeThrough()`        you can see through a doorway
   *   `_add()`                                  `if (d >= 1) continue` — a blow into a doorway
   *                                             removes nothing and pays out no debris, already
   *   `breakmask.js`                            all four layers and the barrier plane discard at
   *                                             depth 1 with the G channel clear — no new uniform,
   *                                             no new sampler, no new program
   *   `support.js` `arch()`                     material over a doorway HANGS, which is what a
   *                                             lintel is. See `COLLAPSE.lintel` for the one
   *                                             place that had to be told the difference between
   *                                             a doorway and a hole somebody smashed.
   *
   * ⚠️ **IT IS NOT A DOOR AND CARRIES NO DOOR STATE.** Open, breachable, chained or empty is
   * `spaces.js`'s business and stays there. This is the hole; what stands in it is a connector.
   *
   * ⚠️ **`_maxDepth` IS DELIBERATELY NOT LIFTED TO 1 BY AN APERTURE**, and that is load-bearing
   * twice over. `wall.js` `_syncStageFromField()` reads it as `floor(maxDepth × 4.999)`, so a
   * pristine slab with a doorway in it would report **stage 4 — dug through — before the first
   * blow**, taking the breakthrough beat, the debris kind and `syncStage` on the wire with it;
   * and `support.js` early-outs on `_maxDepth < gone`, which is what keeps the collapse sweep off
   * a face nobody has touched. A doorway is not damage.
   *
   * ⚠️ **AND IT SURVIVES `reset()`**, for the reason `reset()`'s own note gives about the A
   * channel: a face reset with its doorway filled in is a wall where a doorway was, and nothing
   * would throw — the player would simply walk into it.
   */
  setApertures(rects) {
    this.apertures = rects?.length ? rects.map((r) => ({ ...r })) : null;
    const n = this.cols * this.rows;
    if (!this.apertures) { this.aperture = null; return this; }
    const m = new Uint8Array(n);
    for (const r of this.apertures) {
      // cell CENTRES, exactly as `setInterconnect` samples — which is what makes the two faces'
      // masks exact mirrors of each other rather than one cell apart. See `mirrorBarrierFrom`
      // for what a one-cell disagreement between twins costs.
      for (let cy = 0; cy < this.rows; cy++) {
        const v = (cy + 0.5) / this.rows;
        if (v < r.v0 || v > r.v1) continue;
        for (let cx = 0; cx < this.cols; cx++) {
          const u = (cx + 0.5) / this.cols;
          if (u < r.u0 || u > r.u1) continue;
          m[this.idx(cx, cy)] = 1;
        }
      }
    }
    this.aperture = m;
    this._applyApertures();
    this.dirty = true;
    this._touch();
    return this;
  }

  /**
   * ⚠️ **IDEMPOTENT, AND EVERY WRITER OF `depth` OR `barrier` THAT CAN CLOBBER A DOORWAY CALLS
   * IT.** There are exactly four — `reset()`, `setInterconnect()`, `setBarrierEverywhere()` and
   * `mirrorBarrierFrom()` — and they are the four that write the WHOLE array rather than a
   * neighbourhood. `_add()` needs no call because it early-outs on `depth >= 1`.
   */
  _applyApertures() {
    const m = this.aperture;
    if (!m) return;
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue;
      this.depth[i] = 1;
      this.data[i * 4] = 255;
      this.barrier[i] = 0;
      this.data[i * 4 + 1] = 0;
      if (this._sag) this._sag[i] = 0;
    }
  }

  /** How much of this face is doorway rather than wall, in m². A probe's summary. */
  apertureArea() {
    if (!this.aperture) return 0;
    let n = 0;
    for (let i = 0; i < this.aperture.length; i++) if (this.aperture[i]) n++;
    return n * this.cellW * this.cellH;
  }

  /**
   * ⚠️ **ONE INVALIDATION, AND EVERY DERIVED STRUCTURE HANGS OFF IT.** Three caches exist here
   * for cost reasons — the macro grid, the rectangle decomposition and the open-cell count — and
   * a mutator that clears two of the three is exactly the drift this file exists to prevent.
   * Every writer calls this and nothing clears a cache by hand.
   */
  _touch() {
    this._stamp++;
    this._solids = null;
    this._openCells = -1;
  }

  get cellW() { return this.width / this.cols; }
  get cellH() { return this.height / this.rows; }
  /** The deepest cell on the face. Drives which layer planes can be occluded — see `wall.js`. */
  get maxDepth() { return this._maxDepth; }
  get openCells() { return this._count(); }
  get intact() { return this.hits.length === 0; }

  idx(cx, cy) { return cy * this.cols + cx; }

  /** Depth at a UV, nearest cell. The gameplay read; the shader interpolates its own. */
  depthAt(u, v) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(u * this.cols)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(v * this.rows)));
    return this.depth[this.idx(cx, cy)];
  }

  barrierAt(u, v) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(u * this.cols)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(v * this.rows)));
    return this.barrier[this.idx(cx, cy)];
  }

  // -------------------------------------------------------------------------
  // The brush
  // -------------------------------------------------------------------------

  /**
   * ONE HAMMER BLOW.
   *
   * @param {number} u 0..1 along the face
   * @param {number} v 0..1 up the face
   * @param {number} power 1 is a full blow at the shipped base (`DIG_BASE`). Above 1 deepens the
   *   deposit and does NOT grow the brush — see the split clamp in `_add`.
   * @returns {{removed:number, removedCells:number, brokeThrough:boolean, depthAt:number}}
   *   ⚠️ **`removed` IS IN m² x DEPTH, NOT IN CELLS, AND THAT IS DELIBERATE.** It is what
   *   `wall.js` scales the chunk count and chunk size by — the wall pays out big early and
   *   stingy late, and the falloff is FELT as well as seen — so it has to be a PHYSICAL
   *   quantity. In cells it would be a function of the grid resolution, and changing `CELL`
   *   would silently retune the debris on every wall in the house.
   *   A full-power blow on pristine wall removes ~0.18; a bottomed-out one removes ~0.02.
   */
  applyHit(u, v, power = 1) {
    const rec = { u, v, power };
    this.hits.push(rec);
    return this._add(rec);
  }

  /**
   * ⚠️ **THE ONLY WRITER.** `applyHit` and `replay` both come through here, which is what makes
   * a replay bit-identical to the original run rather than approximately like it.
   */
  _add(rec) {
    const { u, v } = rec;
    /**
     * 🚨 **THE CLAMP IS SPLIT, AND THAT IS THE BUG THAT MADE `[ ]` A NO-OP — see `DIG_BASE`.**
     * This used to be one `clamp(power, 0, 1)` feeding both the radius and the deposit, so
     * `player.digPower` 2 / 4 / 8 all arrived as 1 and the dig-speed key John asked for did
     * nothing at all on the only arm the game ships.
     *
     *   · `pw` — clamped, and it drives the brush RADIUS only. A radius that scaled with an
     *     arbitrary testing multiplier would change the crater's silhouette, the collider boxes
     *     and the debris shape, i.e. it would make a testing key a look and gameplay change.
     *     `R` is therefore exactly what it has always been at every power the game ever sent.
     *   · `power` — unclamped above 1, and it scales the DEPTH one blow deposits. That is the
     *     quantity "digging speed" means, and it is the one the ladder is allowed to move.
     */
    const power = Math.max(0, rec.power);
    const pw = Math.min(1, power);
    const B = this.brush;
    const R = B.radius * (0.55 + 0.45 * pw);
    const cw = this.cellW, ch = this.cellH;
    const hx = u * this.width, hy = v * this.height;
    /**
     * 🎯 THE LOBES — see `LOBE`. Phases and depth are hashed off the blow's own position,
     * quantised to a millimetre, so `replay()` reconstructs this blow's silhouette exactly and
     * two blows a hand's width apart still come off in different shapes.
     */
    const lobed = B.lobe > 1e-6;
    let amp = 0, p1 = 0, p2 = 0, p3 = 0;
    if (lobed) {
      // see LOBE_CELL: the grain is a property of the WALL, so the lattice — not the blow — is
      // what is hashed. Quantised off the millimetre-rounded position so it is exact on replay.
      const q = Math.max(0.001, B.lobeCell) * 1000;
      const qa = Math.round(Math.round(hx * 1000) / q);
      const qb = Math.round(Math.round(hy * 1000) / q);
      p1 = lobeHash(qa, qb) * TAU;
      p2 = lobeHash(qa + 8191, qb * 3 + 131) * TAU;
      p3 = lobeHash(qa * 5 + 7919, qb + 5077) * TAU;
      // ⚠️ THE DEPTH OF THE LOBING VARIES ACROSS THE WALL TOO. With one amplitude every crater is
      // built out of the same silhouette, which reads as a repeated stamp — the exact defect
      // `CELL`'s own note says the brush's falloff exists to avoid.
      amp = B.lobe * R * (0.72 + 0.56 * lobeHash(qa + 104729, qb + 15485863));
    }
    // the scan box has to cover everything that displaces the rim OUTWARD: the lobes by `amp`,
    // and a soft patch of grain by its own amplitude.
    const Ro = R + amp + B.grain;
    const cx0 = Math.max(0, Math.floor((hx - Ro) / cw));
    const cx1 = Math.min(this.cols - 1, Math.ceil((hx + Ro) / cw));
    const cy0 = Math.max(0, Math.floor((hy - Ro) / ch));
    const cy1 = Math.min(this.rows - 1, Math.ceil((hy + Ro) / ch));
    const Ro2 = Ro * Ro;

    let removed = 0;
    let broke = false;
    for (let cy = cy0; cy <= cy1; cy++) {
      const py = (cy + 0.5) * ch - hy;
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = (cx + 0.5) * cw - hx;
        const d2 = px * px + py * py;
        if (d2 >= Ro2) continue;
        const i = this.idx(cx, cy);
        const d = this.depth[i];
        if (d >= 1) continue;
        /**
         * 🎯 **THE PROFILE IS DISPLACED BODILY ALONG THE RADIUS, IN METRES** — see `GRAIN` and
         * `LOBE`. The cell at `r` is treated as the cell at `r + grain + wob`, so every band's
         * contour moves by the same physical distance and the teal boundary lobes exactly as hard
         * as the rim does. It is not a threshold perturbation and is not divided by any gradient.
         *
         * 🚨 **AND THE GRAIN FADES OUT AS THE CELL IS DUG THROUGH, WHICH IS WHAT KEEPS JOHN'S BAND
         * WHERE IT WAS.** A hard plate only takes material from blows centred inside `R - grain`,
         * and at the deep end of the field that is a very small brush — so with a constant grain,
         * the last few per cent of depth on the hardest plates cost a stack of blows each, and
         * opening a body-sized channel measured **49 -> 60 blows** in the browser (66 -> 74 s,
         * one second from failing John's band). Nothing in the LOOK needs that: `wall.js`
         * DAMAGE_BANDS puts the shell's tear at a smoothed depth of 0.235 and the skin's at 0.085,
         * both far below where this taper starts, so the bays are drawn at full amplitude and the
         * only thing that loses the grain is material that is already a hole. The plate structure
         * is in the skin; once you are through the skin there is no plate left to hold.
         *
         * ⚠️ It reads the cell's CURRENT depth, so it is still a pure function of (field, hit) and
         * `replay()` reproduces it exactly — verified byte-for-byte through a JSON round trip.
         */
        const gs = (d - 0.52) * 2.5;                       // 1 below depth 0.52, 0 above 0.92
        const gt = gs <= 0 ? 1 : gs >= 1 ? 0 : 1 - gs * gs * (3 - 2 * gs);
        const r0 = Math.sqrt(d2);
        let rr = r0 + this.grain[i] * gt;
        if (lobed) {
          const a = Math.atan2(py, px);
          rr += amp * (0.30 * Math.sin(2 * a + p1)
                     + 0.42 * Math.sin(3 * a + p2)
                     + 0.28 * Math.sin(5 * a + p3));
        }
        // ⚠️ A SMOOTHSTEP ON A FLOOR, NOT A CONE AND NOT A STAMP. The break mask thresholds a
        // baked field, so the raggedness never came from the brush — but the GRADIENT here is
        // what decides whether a hole deepens or widens, and a shape that reaches 0 at the rim
        // can only widen through the sliver where it is still meaningful. See `RIM`: at 0.62 a
        // blow takes a bite, and the measured breakthrough goes 255 blows -> 34.
        let shape;
        if (rr >= R) {
          // 🐞 see GRAIN_FLOOR: a hard plate RESISTS, it does not leave the brush.
          const gf = this.grainFloor ?? GRAIN_FLOOR;
          if (gf <= 0 || r0 >= R || this.grain[i] <= 0) continue;
          shape = B.rim * gf;
        } else {
          if (rr < 0) rr = 0;
          const t = 1 - rr / R;
          shape = B.rim + (1 - B.rim) * t * t * (3 - 2 * t);
        }
        // The falloff. See STRENGTH / RESIST, and `DIG_BASE` for `B.base`.
        const inc = (B.strength * B.base * power * shape) / (1 + B.resist * d * d);
        const nd = Math.min(1, d + inc);
        removed += nd - d;
        this.depth[i] = nd;
        this.data[i * 4] = Math.round(nd * 255);
        if (nd >= OPEN_AT && !this.barrier[i]) broke = true;
        if (nd > this._maxDepth) this._maxDepth = nd;
      }
    }
    let collapse = null;
    if (removed > 0) {
      this.dirty = true;
      this._touch();
      // ⚠️ INSIDE `_add`, NOT IN `flush()`. A collapse is a consequence of a BLOW, so it has to
      // happen on the field's only writer or `replay()` would rebuild a different wall — and
      // `flush()` is once a frame, which would make the same hit list collapse differently at
      // 30 fps and at 144. See `COLLAPSE`.
      // ⚠️ **THE BLOW GOES IN WITH IT NOW.** Beat 3 of the sag — see `support.js` — is a POSITIONAL
      // act: a region that has already let go comes down when a swing REACHES it, so the rule needs
      // to know where the swing landed and how wide its brush was. `R` is the same radius this
      // method just dug with, so the reach cannot drift from the crater the player is looking at.
      collapse = this._collapse(u, v, R);
      if (collapse && collapse.broke) broke = true;
    }
    if (broke && !this.brokeThrough) this.brokeThrough = true;
    return {
      removed: removed * cw * ch, removedCells: removed, brokeThrough: broke,
      depthAt: this.depthAt(u, v),
      /**
       * 🧱 What the blow brought down beyond what it hit, so the view can pay it out as debris
       * shaped like the piece that left. `null` when nothing collapsed, which is most blows.
       */
      collapse,
    };
  }

  /**
   * Bring down wall that has nothing holding it up. See `COLLAPSE` for the design and for why
   * this is a support test and not the connectivity test `disconnection.md` specifies.
   *
   * ⚠️ **THE RULE LIVES IN `support.js` BECAUSE THE STRAIN TELL HAS TO RUN THE SAME SWEEP.**
   * The crazing the player learns from is this rule reported one step early — the same `arch()`
   * call, the same connected regions, the same loads, drawn from `nearFrac` of the threshold
   * upward. A second implementation of "what is hanging and how much does it weigh" would let
   * the tell and the collapse drift, which is this project's most expensive failure class moved
   * out of the collider and into the player's head. One sweep, two readings of it.
   *
   * @returns {null|{cells:number, area:number, u:number, v:number, w:number, h:number,
   *                 broke:boolean, capped:boolean, chained:boolean, waves:number, load:number,
   *                 archCells:number, courseCells:number, lonelyCells:number, spanCells:number}}
   */
  _collapse(u, v, r) {
    return collapseUnsupported(this, this.collapse ?? COLLAPSE,
      r > 0 ? { u, v, r } : null);
  }

  /**
   * 🕸️ **THE STRAIN TELL.** Writes the A channel — the one byte of this texture nothing had ever
   * used — with how close each surviving cell is to being brought down. `breakmask.js` opens
   * cracks along it. See `support.js` `strain()`; it is a RENDER channel and nothing in play may
   * read it, exactly like B.
   */
  _strain() {
    this.strainStat = strainField(this, this.collapse ?? COLLAPSE);
    return this.strainStat;
  }

  /**
   * ⚠️ **COPY THE TWIN'S BARRIER, MIRRORED — DO NOT RECOMPUTE IT FROM THE SAME PARAMETERS.**
   *
   * The first version called `setInterconnect(1 - u, …)` on the twin, which rasterises the same
   * blob in mirrored coordinates — and cell-centre sampling put the two answers **1 to 2 cells
   * apart** (measured: 1531 vs 1529 barrier cells on `f.svc_e.1`). A cell that is passage on one
   * face and barrier on the other is a hole you dig all the way through and still cannot walk
   * through, and it does not throw: it reads as the interconnect being broken. Copying is exact
   * by construction and cannot drift.
   */
  mirrorBarrierFrom(src) {
    if (!src || src.cols !== this.cols || src.rows !== this.rows) return false;
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const b = src.barrier[src.idx(this.cols - 1 - cx, cy)];
        const i = this.idx(cx, cy);
        this.barrier[i] = b;
        this.data[i * 4 + 1] = b ? 255 : 0;
      }
    }
    // 🚪 there is no cyan in a doorway. See `setApertures`.
    this._applyApertures();
    this.dirty = true;
    this._touch();
    return true;
  }

  /** Rebuild this field from a hit list. See the header: this is the network/determinism path. */
  replay(hits) {
    this.reset();
    for (const h of hits) { this.hits.push(h); this._add(h); }
    return this;
  }

  reset() {
    this.depth.fill(0);
    // ⚠️ A goes with R and B. It is the strain tell, and a face reset with last round's crazing
    // still baked into it would show cracks over pristine wall — the class of bug `_apply()`'s
    // barrier latch already cost this project a round of captures.
    for (let i = 0; i < this.depth.length; i++) {
      this.data[i * 4] = 0; this.data[i * 4 + 2] = 0; this.data[i * 4 + 3] = 0;
    }
    this._strainAny = 0;
    // 🚪 A DOORWAY IS NOT DAMAGE AND A ROUND RESET MUST NOT FILL IT IN. Written before the sag
    // clear below so the two orders cannot fight; `_applyApertures` clears the sag byte it owns.
    this._applyApertures();
    // ⚠️ AND THE SAG GOES WITH THEM, for exactly the reason the line above gives about A: a face
    // reset with last round's sag still flagged would craze at full over pristine wall AND would
    // let the next blow pull down a region that never let go. `support.js` owns the array; this is
    // the one place outside it that may touch it, because this is where the hit list is dropped.
    if (this._sag) this._sag.fill(0);
    this.hits.length = 0;
    this.brokeThrough = false;
    this._maxDepth = 0;
    this._openCells = 0;
    this._touch();
    this.dirty = true;
    return this;
  }

  // -------------------------------------------------------------------------
  // The barrier channel
  // -------------------------------------------------------------------------

  /**
   * 🕳️ **THE INTERCONNECT — a seeded blob of "nothing behind it", one per face.**
   *
   * `dig.md` §1: *"it generates procedurally in a different spot each time as the only
   * connection point."* Not a bay index and not a rectangle: the region is a sum of three
   * offset lobes, so its outline is organic and its edges are found by digging rather than by
   * looking. A player who breaks through at one edge of it still has to widen the hole to get a
   * body through, exactly like every other spot on the wall.
   *
   * ⚠️ **THE POSITION IS THE ONLY SEEDED QUANTITY.** The size is fixed, because the search's
   * length is what John's band is about and a seed that could make the answer twice as wide
   * would make the median meaningless.
   *
   * @param {number} cu   centre u 0..1  @param {number} cv centre v 0..1
   * @param {number} [ru] radius in u, as a fraction of width
   * @param {number} [rv] radius in v, as a fraction of height
   * @param {number} [salt] shape seed
   */
  setInterconnect(cu, cv, ru, rv, salt = 0) {
    this.barrier.fill(1);
    for (let i = 0; i < this.barrier.length; i++) this.data[i * 4 + 1] = 255;
    if (cu == null) { this._applyApertures(); this.dirty = true; this._touch(); return this; }
    const lobes = [
      [cu, cv, 1.00],
      [cu + Math.sin(salt * 1.7) * ru * 0.42, cv + Math.cos(salt * 2.3) * rv * 0.40, 0.78],
      [cu + Math.sin(salt * 3.1 + 2.0) * ru * 0.46, cv + Math.cos(salt * 1.3 + 1.0) * rv * 0.44, 0.70],
    ];
    for (let cy = 0; cy < this.rows; cy++) {
      const v = (cy + 0.5) / this.rows;
      for (let cx = 0; cx < this.cols; cx++) {
        const u = (cx + 0.5) / this.cols;
        let inside = false;
        for (const [lu, lv, lr] of lobes) {
          const du = (u - lu) / (ru * lr), dv = (v - lv) / (rv * lr);
          if (du * du + dv * dv < 1) { inside = true; break; }
        }
        if (!inside) continue;
        const i = this.idx(cx, cy);
        this.barrier[i] = 0;
        this.data[i * 4 + 1] = 0;
      }
    }
    // 🚪 the blob was just rasterised over the whole face; a doorway has no cyan either way.
    this._applyApertures();
    this.dirty = true;
    this._touch();
    return this;
  }

  /**
   * 🕳️ **THE HOUSE-WIDE UNLOCK, on one face.** John: *"once the interconnect is accessed by a
   * player the whole robot barrier turns off and players can continue digging into the other
   * rooms."* Every cell already at depth 1 becomes passable on the same frame — the digs you
   * already paid for turn into doors — which is the payoff his sentence promises and which the
   * segmented build also had. Reversible, because `views/game.js` re-derives the plan on every
   * `resetRound()` and a one-way unlock would leave last round's answer open forever.
   */
  setBarrierEverywhere(on) {
    const b = on ? 1 : 0, byte = on ? 255 : 0;
    for (let i = 0; i < this.barrier.length; i++) { this.barrier[i] = b; this.data[i * 4 + 1] = byte; }
    // 🚪 `[B]` re-arming the barrier must not stamp cyan across a doorway. See `setApertures`.
    if (on) this._applyApertures();
    this.dirty = true;
    this._touch();
    return this;
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **ONCE PER FRAME, NEVER ONCE PER HIT.** `dirty` is a flag and not a queue on purpose: a
   * hammer landing three times a second, or a hunter slamming while two players dig, must cost
   * exactly one upload. Returns whether anything was uploaded so a probe can assert the rate.
   */
  flush() {
    if (!this.dirty) return false;
    this._shed();
    // 🕸️ after `_shed()`, so the crazing is taken on the depth the picture is about to show,
    // and before the upload. It writes A only — see `support.js` `strain()`.
    this._strain();
    this._smooth();
    this.texture.needsUpdate = true;
    this.dirty = false;
    return true;
  }

  /**
   * Rebuild the B channel: `depth`, blurred. See the constructor for why it exists.
   *
   * Three separable [1,2,1] passes per axis — a binomial kernel with sigma ~1.22 cells (11 cm),
   * which spreads the brush's one-cell cliff over four or five cells. That is enough for the
   * break mask's own raggedness (+/-0.2 of threshold) to actually move the boundary, and it has
   * a second effect worth having on purpose: **because the four layers take their thresholds at
   * four different depths, a depth ramp spread over 40 cm separates their silhouettes into
   * concentric rings** — the ornate skin, then the white body, then the structure — which is the
   * layering John's reference art shows.
   *
   * ⚠️ **THE 1.10 LIFT IS NOT COSMETIC.** A symmetric blur pulls a plateau of 1.0 down at its
   * own edge, so the region that looks dug through would end up SMALLER than the region a body
   * can walk through — the wrong direction, and the one `solidRects`' `OPEN_FRAC` is careful to
   * avoid. Lifting the blurred value by 10% and clamping restores the plateau's reach.
   *
   * Cost: ~1830 cells x 6 passes x 3 taps, at most once per frame per DAMAGED face, behind the
   * same `dirty` flag that already stops one upload per hit.
   */
  /**
   * 🧩 **ROUND 8: IT DOES NOT BLUR ACROSS A PLATE WALL, AND THAT IS WHAT MAKES THE OUTLINE
   * ANGULAR INSTEAD OF CLOUDY.**
   *
   * The blur's sigma is ~1.22 cells (11 cm) and `GRAIN`'s plates are 24-46 cm, so an isotropic
   * blur rounds every plate corner by about a quarter of the plate. Measured by looking: the first
   * plate build photographed as a scalloped blob with one good spur in it, not as broken plaster —
   * and `refs/dig/dig-gallery-sledge-crew.webp`'s breach is a jagged polyline of straight runs and
   * sharp corners.
   *
   * A plate wall is a real material discontinuity. The staircase this blur exists to remove is the
   * BRUSH's, and the brush's rim runs through plate interiors, so stopping at plate walls costs
   * the fix nothing and keeps the one edge that is supposed to be hard. Neighbours in a different
   * plate are simply dropped and the weights renormalised, which is a joint bilateral filter with
   * a binary range term — the same trick, at zero extra fetches.
   */
  /**
   * 🐞 **A PLATE THAT HAS LOST EVERY NEIGHBOUR FALLS OUT — AND THIS IS THE WHITE ISLAND'S REAL
   * CAUSE, WHICH TWO ROUNDS ATTRIBUTED TO THE SHADER.**
   *
   * Rounds 4 and 8 both diagnosed the white blob floating in the teal as `breakmask.js`'s two
   * clamps meeting, and round 9's brief carried the same instruction (*"lower the `_rrrSpent`
   * ramp — one line"*). **It is refuted by ablation.** Five arms in one page on one crater,
   * sweeping the spent ramp's foot from 0.90 down to 0.02:
   *
   *   | `uSpent` foot | island px | outline curvature, head-on |
   *   |---|---|---|
   *   | 0.90 (shipped) | 1130 | 2.08 px |
   *   | 0.62 | 1109 | 2.15 px |
   *   | 0.42 | 1033 | 2.11 px |
   *   | 0.25 | 726  | **1.49 px** |
   *   | 0.02 | **0** | **0.99 px** |
   *
   * The island only disappears once the ramp has eaten the OUTLINE with it — curvature is the
   * teeth, and `critic-dig-5` logged the outline as correct and closed. A threshold knob that
   * removes the island only by removing the raggedness is not the fix; it is the same knob doing
   * blanket erosion. (A soft knee on `_rrrOrder`'s top clamp was tried in the same page for the
   * same reason and moved the island by 4 px. Also refuted; kept as `uOrderTop`, shipped at 1.)
   *
   * 🎯 **THE HYPOTHESIS THIS PASS WAS BUILT FOR — AND IT IS ALSO REFUTED. SEE `SHED_R`.** The
   * guess was a pillar in the depth field, put there by round 8's own fix: `_smooth()` refuses to
   * blur across a plate wall, `GRAIN` displaces each plate by a per-plate constant, so a plate
   * drawing an unlucky negative displacement would be walled off from the blur on every side and
   * keep a low depth while its neighbours went through. **There is no such pit — zero, at every
   * ring radius from 2 to 6 cells.** The rule below is nevertheless right if one ever appears
   * (*"a plate with nothing left holding it on any side comes away"* — John's own sentence), so
   * it is kept, shipped at `SHED_R` 0, and costs one early-out per flush.
   *
   * 🔬 **WHAT IS LEFT FOR THE NEXT ROUND, WITH THE ELIMINATIONS ALREADY PAID FOR.** Hiding one
   * mesh of the face at a time at the same station (`_chunks11-secab.mjs`): hiding the BARRIER
   * takes the teal and the blob together (teal 239 014 px -> 88 px); hiding any single shell layer
   * leaves the blob standing (layer0 1130 px, layer1 883, layer2 1080, layer3 890) — **because
   * bands 1-3 have bit-identical silhouettes by design, so all three draw the same texels and no
   * single hide can remove it.** Hiding every debris pool changes it by 1 px, so it is not rubble.
   * So it is the white shell, drawn where `_front` is ~0 on all three shell layers at texels
   * `_rrrSpent` cannot reach. **The one candidate nobody has tested is the MARCH's own reach**:
   * `breakmask.js` clamps `_par` at 8, so at a graze a fragment can sample material up to ~31 cm
   * away across the face and be KEPT as a cut face — which would put a detached patch of "wall"
   * well inside the crater, in exactly the place and at exactly the size this blob has. That is a
   * one-arm test (clamp `_par` to 2, re-count) and it is the first thing round 10 should do.
   *
   * ⚠️ **THE CRATER'S OWN RE-ENTRANT NOTCHES ARE PROTECTED BY CONSTRUCTION, AND THAT IS THE ONE
   * THING THIS MUST NOT TOUCH.** A closing fills concave features smaller than its element, and
   * the outline's notches are 13-17% of the hole's width — far larger — but the guard does not
   * rely on that: a cell is only raised if EVERY cell in a (SHED_R + 1) box around it is already
   * past `SHED_AT`. At the rim the box always contains standing wall, so the rim can never be
   * raised. Only fully-enclosed pits are.
   *
   * ⚠️ **IT WRITES `depth`, NOT THE B CHANNEL, AND THAT IS DELIBERATE.** `passable()`,
   * `solidRects()`, sight and routing all read `depth`; writing only the smoothed mirror would
   * make the render show a hole the collider still has a pillar in — two structures that drift,
   * which is this project's most expensive failure class. One grid, two consumers.
   *
   * ⚠️ It cannot move blows-to-through: it only ever fires on a cell that is already surrounded
   * by material dug past `SHED_AT`, which is strictly after the aim point has gone through.
   * `dig-free.mjs` gates the band and was re-run.
   */
  _shed() {
    /**
     * 🐞 **ROUND 10: THE TWO CONSTANTS ARE INSTANCE FIELDS NOW, SO THE RULE IS AN ARM RATHER THAN
     * A REBUILD.** Round 9 shipped this pass at 0 on the strength of a census that asked the
     * wrong question — see `SHED_AT` — and could not sweep it in one page because both numbers
     * were module constants. They default to the exported constants, so nothing moves until a
     * caller assigns.
     */
    const R = this.shedR ?? SHED_R;
    this.shedRaised = 0;
    this.shedPits = 0;
    if (R < 1) return;
    const { cols, rows } = this;
    const n = cols * rows;
    const d = this.depth;
    const a = this._shedA, b = this._shedB;
    // separable grayscale DILATE (local max) at radius R -> b
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      for (let x = 0; x < cols; x++) {
        let m = 0;
        for (let k = -R; k <= R; k++) {
          const xx = x + k < 0 ? 0 : (x + k >= cols ? cols - 1 : x + k);
          const v = d[o + xx]; if (v > m) m = v;
        }
        a[o + x] = m;
      }
    }
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      for (let x = 0; x < cols; x++) {
        let m = 0;
        for (let k = -R; k <= R; k++) {
          const yy = y + k < 0 ? 0 : (y + k >= rows ? rows - 1 : y + k);
          const v = a[yy * cols + x]; if (v > m) m = v;
        }
        b[o + x] = m;
      }
    }
    // separable grayscale ERODE (local min) at radius R -> a. a is now the CLOSING of depth.
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      for (let x = 0; x < cols; x++) {
        let m = 2;
        for (let k = -R; k <= R; k++) {
          const xx = x + k < 0 ? 0 : (x + k >= cols ? cols - 1 : x + k);
          const v = b[o + xx]; if (v < m) m = v;
        }
        a[o + x] = m;
      }
    }
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      for (let x = 0; x < cols; x++) {
        let m = 2;
        for (let k = -R; k <= R; k++) {
          const yy = y + k < 0 ? 0 : (y + k >= rows ? rows - 1 : y + k);
          const v = a[yy * cols + x]; if (v < m) m = v;
        }
        b[o + x] = m;
      }
    }
    // ...and the guard: raise only where the whole (R+1) box is already past SHED_AT, so the
    // crater's own rim — which always has standing wall in its box — cannot be touched.
    const G = R + 1;
    for (let y = G; y < rows - G; y++) {
      const o = y * cols;
      for (let x = G; x < cols - G; x++) {
        const i = o + x;
        if (b[i] <= d[i] + 1e-4) continue;
        this.shedPits++;
        // ⚠️ THE RING, NOT THE BOX — the box contains the pit itself, which is by definition
        // under SHED_AT, so a box test could never pass and the whole pass would be inert.
        const AT = this.shedAt ?? SHED_AT;
        let ok = true;
        for (let k = -G; k <= G && ok; k++) {
          if (d[(y - G) * cols + x + k] < AT) ok = false;
          else if (d[(y + G) * cols + x + k] < AT) ok = false;
          else if (d[(y + k) * cols + x - G] < AT) ok = false;
          else if (d[(y + k) * cols + x + G] < AT) ok = false;
        }
        if (ok) { d[i] = b[i] > 1 ? 1 : b[i]; this.shedRaised++; }
      }
    }
    void n;
  }

  /**
   * 🚪 **AND IT MUST NOT BLUR ACROSS AN APERTURE EITHER — this is John's "the doorways look
   * damaged" and it was never a doorway bug.**
   *
   * John, 2026-08-12: *"the doorways immediately look damaged everywhere when they damage at any
   * point."* The B channel is the RENDERER's blurred copy of depth and it is what the shader's
   * march samples. `_applyApertures()` writes R, G and the sag channel for a doorway cell — **it
   * has never written B** — so the blur ran straight over the doorway's hard rectangular edge and
   * ramped from 1 down to 0 across ~11 cm of the wall beside it. Those texels read as PARTLY
   * eaten, so they miss the `_f < 0.999` discard and render as a **cut face**: the crumbled arris,
   * the lip, the white and the cyan, in a halo around every authored opening.
   *
   * ⚠️ **It appears "when they damage at any point" because until the first blow the face is drawn
   * by `wallinstances.js`'s pristine path and this shader never runs.** The halo was in the field
   * from the moment the house was built; the first hit is only what makes it visible.
   *
   * 🎯 **The fix is the technique this function already uses.** It refuses to blur across a PLATE
   * boundary (`P[il] === P[ic]`) for the same reason — an 11 cm blur rounds a real edge away. An
   * aperture edge is a real edge, authored rather than emergent, and gets the same refusal. Then
   * the doorway's own cells are forced hard to 1 below, because a blurred 1 is still not 1.
   *
   * ⚠️ **This is a RENDER channel and nothing in play may read it** (see the file header). Depth,
   * passability, `channel()` and `solidRects()` are untouched by this and must stay that way.
   */
  _smooth() {
    const { cols, rows } = this;
    const a = this._blurA, b = this._blurB;
    const n = cols * rows;
    const P = this.plate;
    const keyed = this.brush.grain > 1e-6;
    const AP = this.aperture;
    /** same plate/aperture side? An aperture cell and a wall cell never share weight. */
    const wOK = AP
      ? (i, j) => ((!keyed || P[i] === P[j]) && (AP[i] === AP[j]) ? 1 : 0)
      : (i, j) => (!keyed || P[i] === P[j] ? 1 : 0);
    for (let i = 0; i < n; i++) a[i] = this.depth[i];
    for (let pass = 0; pass < 3; pass++) {
      // horizontal, clamping at the edges (a face's border is a real edge, not a wrap)
      for (let y = 0; y < rows; y++) {
        const o = y * cols;
        for (let x = 0; x < cols; x++) {
          const il = o + (x > 0 ? x - 1 : 0);
          const ic = o + x;
          const ir = o + (x < cols - 1 ? x + 1 : cols - 1);
          const wl = wOK(il, ic);
          const wr = wOK(ir, ic);
          b[ic] = (wl * a[il] + 2 * a[ic] + wr * a[ir]) / (wl + 2 + wr);
        }
      }
      // vertical
      for (let y = 0; y < rows; y++) {
        const o = y * cols;
        const oU = (y > 0 ? y - 1 : 0) * cols;
        const oD = (y < rows - 1 ? y + 1 : rows - 1) * cols;
        for (let x = 0; x < cols; x++) {
          const iu = oU + x, ic = o + x, id = oD + x;
          const wu = wOK(iu, ic);
          const wd = wOK(id, ic);
          a[ic] = (wu * b[iu] + 2 * b[ic] + wd * b[id]) / (wu + 2 + wd);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const v = a[i] * 1.10;
      this.data[i * 4 + 2] = v >= 1 ? 255 : (v <= 0 ? 0 : Math.round(v * 255));
    }
    /**
     * 🚪 **AND THE DOORWAY ITSELF IS FORCED HARD TO 1, because a blurred 1 is still not 1.** Even
     * with the refusal above, a doorway cell one row from its own edge takes weight from a
     * clamped neighbour and lands at 0.98 — under the shader's `_f < 0.999` discard, so the
     * opening keeps a thin cut-face fringe inside its own rectangle. `_applyApertures()` cannot
     * do this: it runs when the APERTURES change, and `_smooth()` recomputes this channel from
     * `depth` on every flush, so the last writer has to be here.
     */
    const AP2 = this.aperture;
    if (AP2) for (let i = 0; i < n; i++) if (AP2[i]) this.data[i * 4 + 2] = 255;
  }

  // -------------------------------------------------------------------------
  // Passability — this is the gameplay truth, and it reads `depth`, never the texture
  // -------------------------------------------------------------------------

  _count() {
    if (this._openCells >= 0) return this._openCells;
    let n = 0;
    for (let i = 0; i < this.depth.length; i++) if (this.depth[i] >= OPEN_AT && !this.barrier[i]) n++;
    this._openCells = n;
    return n;
  }

  /** A cell you can see and shoot through: dug out, whatever is behind it. */
  seeThrough(i) { return this.depth[i] >= OPEN_AT; }
  /** A cell a body can occupy: dug out AND nothing standing behind it. */
  passable(i) { return this.depth[i] >= OPEN_AT && !this.barrier[i]; }

  /**
   * THE SOLID REMAINDER, AS RECTANGLES — what `room.js` collides, traces and sight-tests against.
   *
   * ⚠️ **ONE STRUCTURE FOR ALL THREE CONSUMERS, AND THAT IS THE POINT.** `dig.md`'s stage system
   * could hand collision a single AABB because a panel was solid or it was not. A continuous
   * wall is solid in some places and not in others, so the collider has to be a decomposition of
   * the same array the shader samples — the moment it is anything else, what you see and what
   * you can walk through drift and nothing throws.
   *
   * ⚠️ **QUANTISED TO A MACRO GRID, AND THE COARSENESS IS LOAD-BEARING.** `boxesNear` runs over
   * every candidate box on every frame for every body, so a rectangle per 9 cm cell would put
   * ~1800 boxes per face in that loop. `MACRO` cells (4x4 fine cells, ~0.38 m) are merged into
   * runs along the face and then merged vertically, which gives **one** rectangle for an intact
   * face and typically four to eight for a face with a person-sized hole in it.
   *
   * ⚠️ A macro cell counts as gone only when MOST of it is gone (`OPEN_FRAC`), so the collider
   * is deliberately CONSERVATIVE: the hole you can walk through is never bigger than the hole
   * you can see, which is the safe direction. The opposite would let a body walk through
   * standing plaster.
   *
   * @param {boolean} [forSight=false] use `seeThrough` instead of `passable` — a hole with the
   *   barrier behind it stops a body but you can still see and shoot into it.
   * @returns {{u0:number,u1:number,v0:number,v1:number}[]} in FACE-LOCAL 0..1 coordinates
   */
  /**
   * 🕳️ ⚠️ **THE ONE QUANTISED GRID BOTH THE COLLIDER AND THE PASSABILITY TEST READ.**
   *
   * The first version had `channel()` walking the FINE grid and `solidRects()` merging a
   * 4-cell MACRO grid, and it produced exactly the drift this file's header warns about:
   * measured in-game, `blocksMovement()` reported a 0.76 m channel open while the collider still
   * had a box across it, and a body driven at the hole ended **0.34 m short of the wall**. Two
   * structures answering "is this open" is the bug, however carefully each is written.
   *
   * So there is one grid. `channel()` walks macro columns and `solidRects()` emits macro
   * rectangles, and they cannot disagree because they are the same array.
   *
   * 🚨 **MACRO IS 1 CELL (~0.094 m). IT WAS 4, THEN 2, AND 2 WAS STILL COARSER THAN THE THING IT
   * WAS QUANTISING — WHICH IS A SOFTLOCK, NOT AN INACCURACY.**
   *
   * The rule this number has to satisfy, stated for the first time here because the two previous
   * moves were both made by eye: **the quantum must be smaller than the margin of the passage it
   * quantises.** It was not.
   *
   *   · The interconnect's clear width at the row that binds is `IC_H`'s own figure, 0.826 m,
   *     against a 0.680 m body — a design margin of **0.146 m**, and after quantisation the
   *     channel a fully-excavated span offers is **0.731–0.740 m over 17% of seeds**, i.e. a
   *     margin of **0.051 m**. Measured over 1750 face x seed pairs (125 seeds x the 7 edges
   *     `DIG_EDGES` carries x both twins): min ceiling 0.731 m.
   *   · The quantum was **0.185 m across and 0.187 m up** — larger than the margin, three times
   *     larger than the worst case. So the passage is 4 macro columns x 9 macro rows and losing
   *     ANY ONE of those 36 macro cells takes it 0.740 -> 0.555 m, under a body, permanently.
   *   · Measured: **16 of 1750 did exactly that** and could never be opened, whatever the player
   *     did — 406 blows on `service`/`s7` and fifteen more across the sweep. **At MACRO 1:
   *     1750/1750 open, and the min ceiling rises 0.731 -> 0.823 m.**
   *
   * 🔎 **AND IT IS NOT `mirrorBarrierFrom`, WHICH IS WHERE TWO ROUNDS LOOKED.** The full failure
   * list at MACRO 2 is **6 on `.a` and 10 on `.b`** across both `normal: 'x'` and `normal: 'z'`
   * edges — and `.a` is the AUTHORED face, the one `setInterconnect` rasterises and the mirror
   * never touches. `s7`/`f.svc_w.0.a`, the originally filed instance, is one of the six. A
   * three-sample run of `.b`s reads as a mirror defect and is not one; see the constructor's
   * `even` note for the arithmetic showing the mirror is exactly macro-aligned.
   *
   * 🚨 **AND AT MACRO 2 A BODY COULD WALK THROUGH CYAN.** `OPEN_FRAC` 0.7 over a 2x2 block means
   * 3 of 4 cells, so a macro cell holding ONE barrier cell counted as gone and the collider let a
   * body through a 9.4 cm strip of the indestructible barrier. At MACRO 1 `gone` is exactly
   * `passable(i)`, `passable` is false wherever the barrier stands, and that is unreachable by
   * construction rather than by margin. **John has settled the cyan twice; this tightens it.**
   *
   * ⚠️ **IT MAKES THE DIG SLOWER, NOT FASTER, AND THAT IS THE SAFE DIRECTION FOR A MEASURED
   * BAND.** Over the same 1750 faces the median blows-to-through goes **46 -> 48 (+1.9 s at
   * `WEAPON_COOLDOWN.sledge`)**, because the 3-of-4 fudge above is gone. John's band is 45–75 s
   * and `dig-band.mjs` is the instrument; a correctness fix that quietly HALVED the dig would be
   * the regression to fear, and this is 3% the other way. ⚠️ The ceiling improves at the same
   * time — min 0.731 -> **0.823 m** — because fine columns capture the true clear width that the
   * fudge was only approximating.
   *
   * ⚠️ **THE COST IS COLLIDER BOXES ON A DAMAGED FACE, AND A PRISTINE FACE IS UNCHANGED AT 1.**
   * Measured across one dig's lifecycle (`solidRects(false).length`): pristine **1 -> 1**, after
   * a probe 5 -> 14, at the moment the channel opens **11 -> 39**, after the house-wide unlock
   * 16 -> 42. `boxesNear` only ever walks the faces of resident spaces, and only a face somebody
   * has swung at is more than one box, so this is ~30 extra AABBs beside a passage against the
   * 194 static colliders the house already carries. **It is nowhere near the ~1800 the note above
   * warned about — the run merge is what does that work, and it still does.**
   *
   * ⚠️ `MACRO` and `OPEN_FRAC` are kept as named constants so the whole change is one ablation
   * away. At MACRO 1, `OPEN_FRAC` is inert: `open / tot` is 0 or 1 and 1 clears any threshold
   * under it.
   */
  /**
   * @param {boolean} forSight  see `solidRects`
   * @param {boolean} [viaDug]  🚪 **treat a DOORWAY as solid.** The collider, the graph and the
   *   shader must all see a doorway as open — it is a hole — but *"has a player dug through this
   *   wall"* is a different question from *"can a body get past it"*, and `room.js` asks the
   *   second one when it means the first. See `DamageField.channel`'s `viaDug` note.
   */
  _macro(forSight, viaDug = false) {
    const key = (forSight ? 1 : 0) + (viaDug ? 2 : 0);
    const AP = viaDug ? this.aperture : null;
    this._macroCache = this._macroCache || {};
    if (this._macroCache[key] && this._macroCache[key].stamp === this._stamp) return this._macroCache[key];
    const MACRO = 1;
    const OPEN_FRAC = 0.7;
    const mc = Math.ceil(this.cols / MACRO), mr = Math.ceil(this.rows / MACRO);
    const gone = new Uint8Array(mc * mr);
    for (let my = 0; my < mr; my++) {
      for (let mx = 0; mx < mc; mx++) {
        let tot = 0, open = 0;
        for (let cy = my * MACRO; cy < Math.min(this.rows, (my + 1) * MACRO); cy++) {
          for (let cx = mx * MACRO; cx < Math.min(this.cols, (mx + 1) * MACRO); cx++) {
            const i = this.idx(cx, cy);
            tot++;
            if (AP && AP[i]) continue;
            if (forSight ? this.seeThrough(i) : this.passable(i)) open++;
          }
        }
        gone[my * mc + mx] = tot && open / tot >= OPEN_FRAC ? 1 : 0;
      }
    }
    const out = { MACRO, mc, mr, gone, stamp: this._stamp };
    this._macroCache[key] = out;
    return out;
  }

  solidRects(forSight = false) {
    const key = forSight ? 1 : 0;
    if (this._solids && this._solids[key]) return this._solids[key];
    const { MACRO, mc, mr, gone } = this._macro(forSight);
    // horizontal runs per macro row, then merge vertically-identical runs
    const rows = [];
    for (let my = 0; my < mr; my++) {
      const runs = [];
      let start = -1;
      for (let mx = 0; mx <= mc; mx++) {
        const solid = mx < mc && !gone[my * mc + mx];
        if (solid && start < 0) start = mx;
        if (!solid && start >= 0) { runs.push([start, mx]); start = -1; }
      }
      rows.push(runs);
    }
    const out = [];
    const used = rows.map((r) => new Uint8Array(r.length));
    for (let my = 0; my < mr; my++) {
      for (let k = 0; k < rows[my].length; k++) {
        if (used[my][k]) continue;
        const [a, b] = rows[my][k];
        let my1 = my;
        for (let n = my + 1; n < mr; n++) {
          const j = rows[n].findIndex(([x, y], q) => !used[n][q] && x === a && y === b);
          if (j < 0) break;
          used[n][j] = 1;
          my1 = n;
        }
        used[my][k] = 1;
        out.push({
          u0: (a * MACRO) / this.cols, u1: Math.min(1, (b * MACRO) / this.cols),
          v0: (my * MACRO) / this.rows, v1: Math.min(1, ((my1 + 1) * MACRO) / this.rows),
        });
      }
    }
    this._solids = this._solids || {};
    this._solids[key] = out;
    return out;
  }

  /**
   * ⚠️ **CAN A BODY OF THIS SIZE ACTUALLY GET THROUGH — the query `blocksMovement()` is made of.**
   *
   * `dig.md` §5's whole mechanic is that the way through is something you MAKE, so "is this wall
   * open" has to mean "is there a connected hole big enough for me", not "has some cell reached
   * depth 1". A one-cell puncture is a peephole and the collider has to keep refusing it, or the
   * player walks through a 9 cm hole and the wall system is a lie.
   *
   * A body is a circle of `radius` standing on the floor with head at `passH`. It fits at a
   * horizontal position when every cell between the STEP HEIGHT and `passH` there is passable —
   * `room.js` `boxesNear` steps over anything under 0.3 m, so that band and not the floor is the
   * bottom of the test. It gets through when `2 * radius` of contiguous such positions exist.
   *
   * @returns {{open:boolean, width:number, centreU:number}} width in metres of the best channel
   */
  /**
   * @param {boolean} [viaDug] 🚪 **"is there a channel through material a PLAYER REMOVED", as
   *   opposed to "is there a channel".** A doorway is a hole and every consumer of the default
   *   answer is right to see it as one — but `room.js`'s house-wide unlock fires on
   *   `!blocksMovement()` for the interconnect face, and on a slab that contains a doorway that is
   *   true before the first blow lands: **the whole house's barrier drops on the frame the face
   *   first promotes, and `dig.md`'s FIND clock — *"the search IS the game"* — reads zero.**
   *   Measured, `_ap2-slab.mjs` B4. John's own sentence is *"once the interconnect is ACCESSED by
   *   a player"*, and a doorway somebody else built is not access. `wall.js` `dugOpen` is this
   *   question with a name on it.
   */
  channel(radius = 0.34, passH = 1.70, stepH = 0.30, baseY = 0, viaDug = false) {
    const need = 2 * radius;
    const { MACRO, mc, mr, gone } = this._macro(false, viaDug);
    const mh = this.cellH * MACRO, mw = this.cellW * MACRO;
    const r0 = Math.max(0, Math.floor((stepH - baseY) / mh));
    /**
     * ⚠️ **THE CLEAR HEIGHT IS RETURNED, NOT ASSUMED, AND THAT IS WHAT KEEPS THE HUNTER OUT OF
     * A HOLE IT CANNOT FIT THROUGH.** `room.js` `pathPortals(from, to, minW, minH)` filters on
     * BOTH axes precisely because `dig.md`'s low bay was wider than a stage-2 hunter needs and
     * shorter than it is — the BFS would otherwise line it up square in front of an opening
     * `collide()` refuses and it would press into the lintel for the rest of the round. A
     * hammer-dug hole has exactly the same property for free: it is whatever shape you made.
     */
    const colTop = new Float32Array(mc);
    for (let mx = 0; mx < mc; mx++) {
      let my = r0;
      while (my < mr && gone[my * mc + mx]) my++;
      colTop[mx] = my > r0 ? baseY + my * mh : 0;
    }
    let best = 0, bestC = 0, bestH = 0, run = 0, runStart = 0, runH = Infinity;
    for (let mx = 0; mx < mc; mx++) {
      if (colTop[mx] >= passH) {
        if (run === 0) { runStart = mx; runH = Infinity; }
        run++;
        runH = Math.min(runH, colTop[mx]);
        const w = run * mw;
        if (w > best) { best = w; bestC = ((runStart + run / 2) * MACRO) / this.cols; bestH = runH; }
      } else { run = 0; runH = Infinity; }
    }
    return { open: best >= need, width: best, centreU: bestC, height: bestH };
  }

  /**
   * The same question for sight and for bullets, which do not stand on the floor: is there ANY
   * see-through cell at all. Deliberately weaker than `channel` — you can see through a hole you
   * cannot fit through, and that asymmetry is most of what makes a half-dug wall interesting.
   */
  anySeeThrough() {
    for (let i = 0; i < this.depth.length; i++) if (this.depth[i] >= OPEN_AT) return true;
    return false;
  }

  /** Fraction of the face dug through. A probe's summary; nothing in play reads it. */
  stats() {
    let sum = 0, open = 0, see = 0;
    for (let i = 0; i < this.depth.length; i++) {
      sum += this.depth[i];
      if (this.depth[i] >= OPEN_AT) { see++; if (!this.barrier[i]) open++; }
    }
    return {
      cols: this.cols, rows: this.rows, cells: this.depth.length,
      meanDepth: sum / this.depth.length, maxDepth: this._maxDepth,
      openCells: open, seeCells: see, hits: this.hits.length,
      barrierCells: this.barrier.reduce((a, b) => a + b, 0),
    };
  }

  dispose() { this.texture.dispose(); }
}
