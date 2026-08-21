# Appendix: gadgets

**Covers:** the gadget group's glow bug (`fx-glow`) and two "facts" it refuted, the five
attachments landing distinct functions, the `gadget-owner-7` rebuilds (skates ground trail,
"tame lean" wrong-axis bug), `critic-gadget-4/5/6` verdicts, and the `heatWash` contradiction
resolution (both sides were right, about different surfaces).
**Read when:** your slice touches `src/gadgets/**`, gadget materials/effects, or the
gadgets group board (sheet, nailgun, grapple, oil, ball, skates).

---

## GLOW — the gadget group's glow bug, and TWO DOCUMENTED "FACTS" IT REFUTED (fx-glow, 2026-08-04)

**All six gadget views + `limb.detach` + `game.play` re-rendered and UNJUDGED.** Full write-up
in `docs/design/gameplay-plan.md` §3; the block comment in `src/gadgets/gadgetmat.js` carries
the measurements. Three things worth carrying out of the gadget group:

1. **"`glowSprite()` does not carry brightness" was FALSE.** Sprites deposit exactly the
   radiance the arithmetic predicts (+1.70 linear for two additive whites, read back out of
   `pipeline.sceneRT`). The real cause is that **the studio cyc sits at a LINEAR RADIANCE of
   2.2–3.6, where ACES has a slope of about one 8-bit level per unit of radiance.** Nothing a
   normal blend or a unit-brightness additive layer can do — both bounded by a colour of 1.0 —
   can move a backdrop sitting there. A **multiply** filter can, because it divides a channel
   out of the shoulder. This is the same finding already on record for `lightPool`; it is now
   twice-measured and should be assumed for any effect judged on the near-white cyc.
2. **`material.toneMapped` IS A DEAD KNOB IN THIS PIPELINE.** `engine.js` sets
   `renderer.toneMapping = NoToneMapping` (the composite tone-maps), and three only emits the
   tonemapping chunk when the RENDERER has a mode. Flipping `toneMapped` on every sprite in a
   scene moves four separate cyc references by 0–1 level. A previous round's fix turned exactly
   this knob and shipped. If you find yourself reaching for it, you are not fixing anything.
3. **`gadget.oil` had NEVER photographed its own arc or burning splash — its named feature.**
   `views/gadget.js` primed the trigger at `t = 0.5 s`; `shoot.mjs` captures after
   `settle(12)`, i.e. **t ≈ 0.20 s**, so `since = t - t0` was negative and `burn` was 0 in
   every shot ever filed on that piece, including the one its 44 was scored on. Verified
   against the board's own PNG as well as a fresh capture. Fixed in `gadget.js` and
   `gadget-sheet.js`. **Any view that primes an effect on a timer must fire at t=0.**

Measured before → after: nailgun cyc beside the gun **r−b +1 → +62** at the hottest station
(bar art +62, and the whole falloff curve matches within ~5 at every station); skate jet core
**L139 → L249** against a cyc of L220, where before it was 85 levels DARKER than the backdrop
it is supposed to be lighting. Draw calls: nailgun 150 / skates 233 / oil 286.

⚠️ **One cost, stated rather than hidden, and it belongs to `game.play`'s owner:** the nail
gun's heat wash is a multiply filter, and a filter tuned on the bright cyc is roughly twice as
violent on a MID-TONE, because that is where the tone curve still has slope. In the dark
corridor the warm floor patch beside the player measures **171/99/45 (L110) → 181/48/11
(L74)** — the pool deepens from amber to a redder orange and loses ~36 luminance over about
2 m of floor. Tint saturation, not strength, is the knob that trades these off; the numbers for
four settings are in the comment at `heatWash` in `src/gadgets/index.js`.

🔧 `harness/evidence/_tmp_fxglow.mjs` is the instrument the whole diagnosis rests on: it boots a view,
freezes a probe list, then renders once per scene-mutation STATE and reports the **pre-tonemap
HDR radiance from `pipeline.sceneRT` and the final LDR pixel at the same coordinate**. That
pairing is what separates "the effect never deposited light" from "the tone curve ate the light
it deposited", and no existing tool could tell those apart. `harness/evidence/_tmp_fxprobe.mjs` adds
`--row`/`--col` scans across a PNG, which is how both the render and the bar art were profiled.

**Also: every mesh in `src/gadgets/*` now has a name** (`mesh(geo, mat, D, name)` plus a
`named({...})` helper that labels a mesh with its own variable name). `_tmp_geoprobe.mjs --pick`
returned "(unnamed)" for every gadget hit before this and could only report materials; it now
answers e.g. `railGuide1 / parent nailgunBody`. Verified: 0 unnamed meshes or sprites in every
gadget subtree, across all five gadgets.


## 🎯 ALL FIVE ATTACHMENTS NOW HAVE DISTINCT FUNCTIONS (was: five tracer colours)

Before this, `weapons.js` branched on weapon name **exactly once** — to pick a tracer colour.
Every gadget was the same hitscan with different numbers, while `rules.js`'s own comments
described five different tools nobody had built. Each is now verified by a driven playtest
(`harness/scenarios/{ball-decoy,oil-fire,grapple-pull,skate-slam}.mjs`):

| | verb | mechanism | verified |
|---|---|---|---|
| nailgun | fight | unchanged | — |
| **ball** | distract | `HunterAI.hearNoise(pos, strength)` — a noise that is NOT a body | PATROL→SEARCH, walks 3.4 m to the impact point (0.0 m from it, 1.7 m from the thrower), refused mid-chase |
| **oil** | deny | burning pool, 1.35 m / 6 s, damage over time | 5 damage ticks, burns out |
| **grapple** | escape | `Player.grappleTo()` drives VELOCITY, not a teleport | 12.6 m haul, clean release; hunter dragged 7.9 → 6.3 m |
| **skates** | outrun | contact slam above 6.0 m/s | 7.34 m/s charge, one 40-damage slam |

Design decisions worth not re-litigating: `hearNoise` deliberately does **not** set `target`
(a target is something `_attack` takes a limb from, and a ball has no rig) and is **refused
during PURSUE/ATTACK/GROW**, so a decoy can never cancel a chase it has already lost. The
grapple releases the frame it stops making progress, because a pull grinding against geometry
reads as a bug. `WEAPON_DAMAGE.skates` (40) had **never fired once** in the project's history —
skates have no trigger, so the entry sat unused while the gadget was purely a movement mode.

⚠️ **Traps that cost real time here, all found by tests failing on working code:**
- The ball's noise is heard from where it LANDS, within ~11.9 m. Hurled at the far wall it
  correctly does nothing — you throw it PAST the hunter. Emergent from the hearing model.
- **Do not assert fire damage via `hunter.stun`**: fire adds ~8.7 stun/s against a **55/s
  decay**, so it can never accumulate. Count damage applications instead.
- **Skates steer by `player.facing`, NOT `aimYaw`**, and fit via `rig.fitSkates()` (socket
  `shinBoth`, over both legs), not `fitGadget`. Setting only `aimYaw` drives the player into a
  wall and looks exactly like a broken accelerator.
- `WeaponSystem` is built BEFORE the hunter exists, so `this.hunter?.hearNoise?.()` was an
  optional-chained no-op until `weapons.hunter = hunter` was wired explicitly.

**Honest gap, written down rather than glossed:** oil damages the hunter but does not yet DENY
it ground — the first tick's knockback shoves it clear, and pathing does not know pools exist.
True area denial needs `_waypoint`/`_steerTo` to treat live fires as obstacles.

**Swap system steps 1–3 are also in** (`docs/design/attachments.md`, Model C, John's call):
honest prompts, `hold Q` ejects what is fitted, `hold E` cycles the targeted socket with a
rotating ring on the rosette, `tap E` fits there, and fitting over an occupied socket ejects
the old part in one press — recoverable, never consumed. A swap only fires when it changes the
socket's CLASS (gadget↔limb); trading a healthy arm for another is churn indistinguishable
from the control doing nothing.


### ✅ `fx-glow` LANDED — and it REFUTED the brief it was given
**"`glowSprite()` does not carry brightness" was FALSE.** It carries exactly the predicted
radiance (**+1.70 linear** at the skate core). Three other faults were doing the work:
1. **The tone curve, which is most of it.** The studio cyc is not near 1.0 — it sits at linear
   radiance **2.16–3.62**, which ACES maps to **LDR 204–207**, where the slope is about **one
   8-bit level per unit of radiance**. A normal blend and a unit-brightness additive layer are
   both bounded by a colour of 1.0, so **neither can move that backdrop**. One pixel, one sprite:
   normal blend `207/206/205 → 205/204/202`; the SAME sprite as a **multiply** → `209/188/168`
   (r−b +2 → **+41**). Same mechanism already on record for `lightPool` — now twice-measured.
2. ⚠️ **`toneMapped:false` IS AN INERT KNOB** — `engine.js` sets `NoToneMapping`, so three never
   emits the chunk. **The previous round's "fix" turned exactly this knob**, which is why the
   defect survived it. Flipping it on every sprite moved four references by 0–1 level.
3. **Render order.** On the right skate (`scale.x = -1`) the mirror flipped the transparent sort
   and normal-blended plume ellipsoids drew over the additive sprites: **+1.70 → +0.06**,
   recovered to +1.48 with `depthTest` off.

Results: nailgun r−b `+1/+1/+1/+2/+4` → **`+12/+18/+30/+46/+62`** against bar art
`+6/+17/+27/+45/+62`. Skate jet core L139 → **L249** against a local cyc of L220 — from **85
levels DARKER than its backdrop to +29 above it**, where the art is +24. Also: **0 unnamed meshes
or sprites remain across all five gadget subtrees**, so `--pick` now answers `railGuide1 / parent
nailgunBody` instead of `(unnamed)`.

⚠️ **ONE COST:** a multiply tuned on the bright cyc is about **twice as violent on a mid-tone**.
The warm floor patch beside the player goes **171/99/45 (L110) → 181/48/11 (L74)** — amber to a
redder orange, losing ~36 luminance over ~2 m. Four measured settings sit at `heatWash` in
`src/gadgets/index.js`.


### `critic-gadget-4` (filed 2026-08-04) — three of six moved, and one CONTRADICTION is open
nailgun 56→**65** · oil 50→**64** · skates 42→**60** · grapple 46→**46** · ball **60 (PASS,
the board's only one)** · sheet 60→**67**. Blind and post-art verdicts agreed in direction on all
six. **`gadget.oil`'s 64 is its first score ever awarded on a picture of the actual effect.**


### ✅ `critic-gadget-6` — **sheet 75 → 80, nailgun 72 → 78, grapple 68 → 76, skates 60 → 70**
**`gadget.sheet` at 80 is the highest score in the project.** Board: sheet 80 · nailgun 78 ·
grapple 76 · room.ballroom 76 · room.gallery 75 · light.shaft 74 · oil 64 · ball 60 (PASS).
**Still 0/37 WOWED.** Blind and post-art agreed in direction on all four; the critic re-verified
motion-dependent claims at **multiple `--at` instants** rather than the default alone.

Independently re-verified rather than taken on trust: skate screen tilt **36.08° against the art's
~35°** (essentially exact), wheel-floor contact **−0.0177 m → +0.0021 m**, and the drift trail's
percentile A/B re-run with `dbg=nodrift`.

**Three real defects remain, two of them new:**
1. **The skate stride reads as an AIRBORNE LEAP** — legs tucked together, wheels bunched under the
   hips — where the art is a low grounded driving stride. **The lean angle is now correct and the
   LEG GEOMETRY still sells "jumping."**
2. **The drift trail reads as a diffuse blurred smudge**, not the art's crisp curved skid-arc lines.
3. 🆕 **The nailgun's coil TOPOLOGY does not match, even though its proportion now does** — ours is
   round-section torus rings stacked perpendicular around the barrel (a slinky); the art's is a
   **square-section wire wound in a flatter helix running lengthwise**. The sheet inherits it.

**The grapple's half-correction is ruled reasonable but not sufficient** — hang axis −17.18° →
−8.01° against the art's ~4°, a real halving, and the right call now that 93.4 mm thigh clearance
makes *silhouette* the binding constraint — **but it is still the most legible departure from the
reference in a blind look.** Open hate, not a blocker.


### `gadget-owner-7` — the skates' "tame lean" was a WRONG-AXIS BUG, not a magnitude choice
**`rotation.set(0, yaw, roll)` under three's default XYZ order is `Ry·Rz`, so the bank was applied
about the body's FORWARD axis** — which at yaw −1.40 lies almost exactly in the image plane (dot
with view dir **0.040**), i.e. a rotation you cannot see. Measured trunk tilt hips→head: **2.83°
against the art's ~35°.** Re-hung as a pitch about the **lateral** axis (dot **−0.991**, near-pure
screen rotation) via Euler order `YXZ` → **36.1°**. **A defect filed as "too subtle" was a
rotation that was never on screen at all.**

🆕 **The drift trail is built** — nested skid arcs, grit, lifting dust, ground skirt, hard chips —
and deliberately parented to the **scene root, not `gadget.root`**, because `fitSkates()` does
`unit.root.add(g.root)` and **a skid mark that follows you around is not a skid mark.** A/B'd
against its own absence via `--extra "dbg=nodrift"`: floor beside the wheels **−29.3 LDR**,
mid-trail −9.1, far −3.7, against art targets −45 / −20 / ~0.
⚠️ **Bug it exposed: `wheelRadius` published the tyre torus's RING radius, not ring+tube, so every
skate capture ever taken stood 21 mm (~11 px) BELOW the floor** — invisible on a bare cyc, not
invisible once something is drawn on that floor.

**Also:** grapple abduction −0.35 → −0.16 rad (hang axis on screen **−17.18° → −8.01°**, art ~4°;
thigh clearance 133.7 → 93.4 mm) · nailgun coil **58% → ~21%** of axial length (art ~22%), shrunk
*and* moved to the breech · heat direction re-verified unchanged (21/21 rail-owned, breech L209.8
vs muzzle L121.0) because the coil moved over the rail.

**Three more brief facts found false:** the **thigh-clearance risk was overstated** (133.7 mm
before anything was touched — the binding constraint is *silhouette*, not collision, which is why
it still stopped at half); the **grapple rest-cable hate is refuted**; and the **sheet re-types
the arm**, so the standalone fix alone would have left it broken.

⚠️ **CORRECTION (`critic-gadget-6`): THE "art 35% vs ours 46%" FIGURE IS INVALID — DO NOT CITE IT,
AND THE LEAD RECORDED IT HERE UNCHALLENGED.** It was measured with `--extra at=0.85`, the
**launch-peak extended pose**, against a hate filed about the **REST pose** — the launch window
opens at 0.35 s and the code comment says the default ~0.20 s capture is designed to land on the
art's rest pose. **Same cross-instant mismatch that has burned this campaign repeatedly, this time
in the direction of a false refutation.** Re-measured on the default/rest capture: a continuous
unbroken silhouette housing→claw at **~35–40% of housing height, the same order as the art's 35%**.
**The hate is still refuted — on size, and for the right underlying reason (legibility, not
distance) — just not by the number that was cited.** The art's shank is *also* a continuous
connected member, so the original hate's "clear gap roughly a housing-height tall" overstated the
art too. **`--at` cuts both ways: it exposes bugs the default hides, and it manufactures
refutations if you compare across instants.**
✅ **And the sheet's arm is NOT a missed fix.** It now sits at **−0.26 rad** (`shoulderL/elbowL
−0.22/−0.04`), deliberately more conservative than the standalone's −0.16 because **five figures
at 1.20 m centres need more clearance at quarter scale**. Verified: no torso overlap on the
capture. **A legitimate design choice, not a defect** — but the general rule stands, because the
sheet re-types rather than imports.

⚠️ **COST: `gadget.skates` 233 → 315 draw calls (76 sprites). Fine for a studio view, NOT for the
mansion — INSTANCE IT BEFORE WIRING THE TRAIL INTO `game.play`.**


### `critic-gadget-5` — grapple **46 → 68**, nailgun **65 → 72**, sheet **67 → 75 (HIGHEST IN THE PROJECT)**
Board: sheet **75** · nailgun **72** · grapple **68** · oil 64 · ball 60 (PASS) · skates 60.

**The grapple's span now near-exactly matches the art**, re-measured by the critic on its OWN
fresh capture and on the art independently: housing width **75–76 px render vs 76 px art**, claw
peak span **90 px vs 91 px**, ratio **1.19 vs 1.20** — tighter than the builder's own claimed
"after 1.07". The `--at 0.85` check confirmed the `atan2` fix: one clean shank/cable at full
length, correctly oriented, no floating segment.

⚠️ **THE "NAILGUN HEAT DIRECTION IS WRONG" HATE IS REFUTED — and the lead forwarded it into TWO
briefs.** `_g6-railscan.mjs` (occlusion-aware, raycast-gated) run fresh: **21/21 stations owned by
the rail**, breech half **L211.4** vs muzzle half **L122.8**, peak L240 beside the coil, sooty cap
L30 at the muzzle — matching the art's grip-hot/muzzle-dark read and HANDOFF's own recorded
measurement. **The prior critic most likely sampled BRASS COIL pixels near the breech — precisely
the trap the scan tool was built to prevent.** Dropped. The surviving nailgun hate is real: the
**coil occupies ~50–60% of visible gun length in the render vs ~20% in the art**, where the ribbed
barrel is unambiguously dominant.

⚠️ **A COMPOSITE PIECE INHERITS ITS PARTS' STALE HATES VERBATIM.** `gadget.sheet`'s single
documented hate was the old nailgun and grapple complaints copied across — **both now refuted**,
which is most of why it moved 67 → 75. **When a part is re-judged, re-judge the sheet that quotes
it**, or the board carries a defect that no longer exists in two places.

**The 20° shoulder tilt is now the dominant remaining gap** — verified as fact in
`src/views/gadget.js` (`shoulderL Z −0.28` + `elbowL Z −0.07` = **−0.35 rad = 20.05°**) against
the art's near-vertical ~4°. Now that the housing shape is right, it is *the* legible "doesn't
match" cue. Filed as a hate, not a blocker; **the thig​h-clearance risk is legitimate — a PARTIAL
pull-in is the recommendation, not the full correction.**


### ✅ `gadget-owner-7` — the skates' GROUND TRAIL is built, and the "tame lean" was a WRONG-AXIS BUG

`gadget.skates` · `gadget.grapple` · `gadget.nailgun` · `gadget.sheet` all **BUILDING/unscored**
(a builder may not score its own work). `gadget.oil` and `gadget.ball` untouched.

**1. ⚠️ THE LEAN WAS BEING APPLIED TO THE ONE AXIS THIS CAMERA CANNOT SEE — the same trap as the
hunter's stage-1 stoop, in a different file.** `views/gadget.js` had `unit.root.rotation.set(0,
yaw, roll)`, which under three's default XYZ order is `Ry(yaw)·Rz(roll)`: the bank is applied
about the body's **forward** axis and then yawed by −80°, which lays that axis almost exactly in
the image plane. Measured through the real capture camera (`harness/evidence/_g7_skate.mjs`):

| | dot with view dir | what a rotation about it does |
|---|---|---|
| body **forward** (the old `roll`) | **0.040** | moves the head into DEPTH — invisible |
| body **lateral** (the new `pitch`) | **−0.991** | very nearly a pure screen-plane rotation |

So `roll` 0.26 rad (14.9°) bought a **trunk tilt of 2.83° on screen** (hips→head, capture px)
against the bar art's **~35°** — that is the whole of the critic's "markedly less dynamic …
noticeably tamer". Moving the lean to a pitch about the lateral axis (Euler order **`YXZ`**, so
the roll still applies first in the body frame and the call is bit-identical at pitch 0) gives
**36.1°**. `roll` was also cut 0.26 → 0.08 because it lifts the trailing skate
`2·0.1275·sin(roll)` off the floor — **59 mm of air, paid for a lean that does not show.**

**2. THE GROUND TRAIL IS A REAL OBJECT NOW** — `export function skateDriftTrail()` in
`src/gadgets/index.js`, added at the SCENE root and deliberately not under `gadget.root`
(`LimbRig.fitSkates()` does `unit.root.add(g.root)`, and a skid mark that follows you around is
not a skid mark). Nested skid arcs, grit and a lifting dust cloud, sampled off the art with
**percentiles, not means** (`harness/evidence/_g7_px.mjs`) — a skid mark is a few dark pixels among a lot
of bright floor, and any mean over a box containing one just reports the floor.

A/B'd against its own absence with `--extra "dbg=nodrift"`, which is the knob that says what it
is worth: floor beside the wheels **−29.3 LDR**, mid-trail **−9.1**, far trail **−3.7**, against
art targets of −45 / −20 / ~0. Two traps, both of which would have shipped as "the marks just
stop":
- ⚠️ **THE DECAL CANNOT BE FLAT.** `_studio.js`'s cyc is only a floor over `z ∈ [0, 3.8]`;
  behind that it curves up as `y = z²/2R`, R = 3.2 — 4 mm at z = −0.16. The trail runs ~2.5 m
  BEHIND the skates, so a flat quad 4 mm off the floor is swallowed within 160 mm.
- ⚠️ **AND ITS LIFT MUST BEAT THE CYC'S FACETING.** `cycGeometry()` samples that quarter arc with
  14 flat chords; the profile is convex so every chord sits **5.0 mm ABOVE** the true curve
  (`R(1−cos(θ/2))`). A constant 4 mm lift is *below the backdrop mesh* over most of the curve.
- ⚠️ **AND THE SHEET'S LATERAL AXIS IS THE CAMERA'S DEPTH AXIS.** At yaw −1.40 travel is 9.8° off
  world X, so the trail's half-WIDTH is spent almost entirely in depth: the first pass at 4.2 m
  wide put its far edge **0.69 m up the back wall** and the arcs photographed as scratches
  hanging in the air. Narrow sheet + a v-edge alpha fade is what keeps marks on the floor.

**3. 🐛 `wheelRadius` REPORTED THE WRONG RADIUS AND EVERY SKATE CAPTURE EVER TAKEN WAS SUNK INTO
THE FLOOR.** The tyre is `TorusGeometry(r, r*0.36)`, whose road-contacting surface is at
`r + tube = r*1.36`, but the gadget published plain `r`. Its only consumer is the drop-to-floor
solve in `views/gadget.js`, so every skate stood **H·0.0122 = 21 mm (~11 capture px) below y=0**.
Invisible while the floor was a featureless cyc; **stops being invisible the moment there is a
mark drawn on it.** Measured on the real lowest tyre VERTEX: −0.0177 m before, ~0 after.

**4. THE GRAPPLE'S SHOULDER TILT, pulled in with the thigh risk MEASURED rather than assumed.**
`RIGS.grapple` −0.35 → −0.16 rad. `_g7_skate.mjs --clear` does an all-pairs vertex scan between
the gadget subtree and the hip/knee meshes: **min separation 133.7 → 93.4 mm**, and the housing's
**hang axis on screen −17.18° → −8.01°** (art ~4°). ⚠️ **The screen angle is not the rig number** —
the gadget carries its own −0.05 tilt, so 0.19 rad at the joints buys 9.2° of visible hang.
Stopped at half because the binding constraint is **silhouette** (the housing must keep reading
against the cyc) and not collision; the collision headroom was never the limit.

⚠️ **AND THE GRAPPLE'S OTHER HATE LOOKS REFUTED — for `critic-gadget-6` to rule on.** "The claw
sits nearly flush against the housing's shoe, where the art shows a clear taut-cable gap roughly
a housing-height tall." Measured on the same landmarks in both images (housing shoe → fluke
hinge, normalised by housing height): **art 52/151 px = 35%, ours 56/121 px = 46%.** Our gap is
*larger* than the art's, and the art's is nowhere near a housing height. The real difference is
**legibility**: the art's cable reads as a distinct dark twisted line beside the shank, ours does
not separate from it.

**5. THE NAILGUN'S COIL, and its numbers check out.** Measured along the bore on 3–4× crops of
both images: **art ~22% of visible gun length, render ~58%.** Two faults, and shrinking alone
fixes only one — SIZE (`scale.y` 1.55 on ring radius H·0.066 = a half-extent of H·0.102, so the
bundle alone was **68% as long as the whole slab**) and PLACE (at `midY + L*0.20` it sat a third
of the way down the barrel, **cutting the dominant shape in half lengthwise**). Now `(1, 0.64,
0.55)` at `midY + L*0.333` — a compact pack bolted to the breech, measuring **~21%**.
**The heat direction was NOT touched, and was re-verified anyway** because the coil moved over
the rail: `_g6-railscan.mjs` fresh gives **21/21 rail-owned stations, breech L209.8 vs muzzle
L121.0**, peak t=0.85, cap L29 — unchanged from the recorded L211.4/L122.8. Heat-wash bloom
unchanged too (cyc r−b beside the gun **+62.4 → +61.8**).

**6. ⚠️ THE SHEET'S GRAPPLE ARM DOES NOT INHERIT FROM THE STANDALONE PIECE.** A sharper version of
the composite trap already on record. The sheet's hate named the nailgun coil and the grapple
tilt; the coil is geometry and propagated for free, but the **abduction is typed separately in
`gadget-sheet.js`** and was **−0.39 rad (22.3°) — MORE outward than the −0.35 the critic measured
on the standalone.** Fixing `gadget.js` alone would have left the sheet's copy fully intact while
the report claimed the defect closed. Pulled to −0.26 (14.9°), less than the standalone's −0.16
because five figures at 1.20 m centres need the abduction to keep each gadget off its own torso.

**Costs, stated rather than hidden.** `gadget.skates` **233 → 315 calls / 128k tris** — the trail
is one mesh plus 76 sprites and every sprite is a draw call. Fine for a single-subject studio
view, **not fine for the mansion** (625 calls for a whole room, and the player wears these while
moving): instance or bake the puffs before wiring this into `game`. `gadget.nailgun` 150,
unchanged. `gadget.sheet` 983 / 604k, over the *room* budget, which is not this piece's gate and
is unchanged by this round.

**Instruments left behind:** `harness/evidence/_g7_px.mjs` (percentile stats over PNG rectangles — the
tool for thin dark marks on bright floors) and `harness/evidence/_g7_skate.mjs` (joint/floor projection
through the real capture camera, per-skate ground contact, `--clear` gadget↔thigh clearance and
gadget hang axis). ⚠️ The latter's first version matched **zero** gadget meshes from a guessed
root name and cheerfully reported a clearance of **Infinity over 0 vertex pairs** — it now
reports SKIP instead, which is the house rule it had just violated.


### ✅ THE `heatWash` CONTRADICTION IS RESOLVED — **BOTH SIDES WERE RIGHT, ABOUT DIFFERENT SURFACES**
`gadget-owner-6` re-measured both ends with one instrument. **The normal blend is not inert
everywhere — it is inert ON THE CYC** (peak r−b gain +9 vs the multiply's +53 and the art's +62)
and is the **best option on the corridor** (+6.5 L). The critic and `fx-glow` were each measuring
one surface; neither was wrong, and applying the critic's global pick would have thrown the whole
cyc result away exactly as suspected.

**And the surface gate was ALREADY BUILT, not merely proposed** — `HEAT_WASH = { studio: …0.46,
world: …0.12 }` at `src/gadgets/index.js:68`, selected by `opts.backdrop`, passed at all three
world sites in `limbs.js` and correctly omitted by `views/gadget.js`. Its author died before
photographing it. Proven live from both ends by one build: `as-built` matches the **studio** value
on the cyc (r−b 13/58/50…) and the **world** value in the corridor (ΔL −5.6). **Corridor cost cut
from 21 LDR levels to 5.6 while the cyc result is untouched. The `game.play` trade is no longer
unacceptable.**
⚠️ **And the "shipped fix" really never took effect** — (2) ΔL −22.2 vs (4) −20.6, **1.6 levels
apart**. Backing the tint off from `0xff7a20` to `0xff8a3c` was *arithmetically incapable* of
doing anything at strength 0.46: `1 − (1 − tint)·strength` leaves them ~9%/20% apart after
strength. **The knob was never tint saturation — it is strength, and strength cannot be one value
for two surfaces.** That is precisely what the gate fixes.
⚠️ **A STALE DOCSTRING CAUSED TWO ROUNDS OF ARGUMENT.** `hotSteel()` in `gadgetmat.js` documented
the *opposite* of what ships ("the reference shows the muzzle end white-hot") with an inline
`// hottest at the muzzle`. Measured truth: breech/coil half **L210.7** vs muzzle half **L121.4**,
peak `244/239/228` at t=0.85 falling to a **dark cap `48/24/18`** — which matches the art. Comment
corrected; no render change. **A comment that contradicts the code is a defect with a long tail.**

⚠️ **(Superseded, kept for the trail) THE `heatWash` RULING CONTRADICTED THE PREVIOUS ROUND'S
MEASUREMENT:** The critic ruled the trade unacceptable in `game.play` and picked **option (1), the
normal blend**. But `fx-glow` measured that a normal blend is **INERT on this backdrop** (bounded
by a colour of 1.0 at a tone-curve operating point whose slope is ~1 LDR level per unit of
radiance), so option (1) plausibly **undoes the whole round** — nailgun r−b +1→+62, skate jet
L139→L249. One of the two is wrong. **The critic's SECOND suggestion is the promising one: gate
wash strength by the SURFACE it lands on**, rather than one static value serving both a
near-white cyc and a lit corridor mid-tone — which would let both results stand. `gadget-owner-5`
is resolving it by measurement.
⚠️ **Separately: the SHIPPED setting may never have taken effect.** The critic measured it at
`171/99/45 → 181/48/11`, **within 1–4 units of option (2) — the setting rejected on its own
terms.** If that holds, the claimed fix is not in the image and that is the actual bug.
⚠️ **AND THE VERDICT IS NOT REPRODUCIBLE:** the critic could not re-stage a `game.play` capture
with a gadget equipped — *"no scenario/debug loadout found within budget"* — so its ruling rests
entirely on numbers already on record. **`gadget-owner-5` is building that scenario first.**


