# Gameplay plan — cheek, surprise, purpose, and a house that comes apart

John, 2026-08-04: *"players interact and have cheeky moments hindering each other as they run
from the hunter · scary moments when the hunter surprises the players · each attachment feels
purposeful and satisfying · most of the map destructible with satisfying crumbling walls."*

The good news is that three of the four are mostly **built** and need connecting rather than
inventing. The fourth is blocked on one specific job. This plan says which is which, because
the difference decides what to spend on.

---

## 0. The one blocker, stated first

**`src/net/client.js` is not wired into `src/views/game.js`.** `game.play` runs
single-authority offline. The server itself is in good shape — `net/server.mjs` passes 22/22
plus 17/17 on the gaps suite, with default-deny damage gating, real cooldowns and
disconnect cleanup — but **no player has ever met another player.**

So every "cheeky moment" below is theoretical until that lands. It is also the single highest
-leverage unbuilt thing in the project, because it is the difference between a horror toy and
the game in the pitch. One caveat already recorded: `attack()` sets a flat 0.14 s cooldown for
every gadget while the server enforces the real table (grapple 1.4 s, oil 1.05 s) — **fix that
before wiring or an honest player's shots get rejected as rate-limit violations.**

---

## 1. Cheek — and the discovery is that we already built the substrate

**Every gadget acts on the WORLD, not on a designated target.** That was decided for other
reasons, and it means each one already has a griefing use with no new mechanic:

| gadget | its verb | the cheeky use, free |
|---|---|---|
| **ball** | make a noise somewhere you aren't | throw it *at your friend's feet* — the hunter investigates **them** |
| **oil** | deny ground for ~6 s | pool the doorway they are sprinting for |
| **grapple** | haul yourself to an anchor | it already hauls the *hunter* when fired at a body — **fire it at a player and it hauls them**, toward you, or out of cover |
| **skates** | 9 m/s, contact slam at 40 | body-check a teammate into the open |
| **nailgun** | fight | the stagger already exists; shoving beats damage |

And the deepest one needs nothing at all: **limbs are health AND weapons, and a detached limb
is an ordinary world object.** A friend loses a leg, and you can reach it first. You can carry
it. You can throw it. You can fit *their* arm to *your* empty socket. The game's core mechanic
is already a social one — it just has never had a second player in the room.

**Design rules to keep it cheeky rather than toxic** (this is the part worth deciding
deliberately):
- **Hindering must never be strictly better than helping.** Refitting a friend's limb should be
  faster than stealing it, so betrayal costs tempo. Grief is funniest when it is a *choice*, not
  the optimum.
- **The hunter is the only thing that takes limbs.** Players shove, block, distract and steal;
  they do not dismember each other. Keeps the horror pointed one way.
- **Every grief should be visibly attributable.** If oil pools in your doorway you must see who
  threw it — a grief nobody can pin on anyone is just bad luck.
- **A downed player is revivable by a teammate** (refit a limb from the field). That single rule
  turns every dismemberment into a decision for everyone else in the room.

## 2. Surprise — the honest gap

Today the hunter's approach is *deliberately legible*: a perception ladder, a commit tell
measured at 5.9× the room's noise floor, a threat vignette. That was built to fix a real defect
(you died with no warning) and it must stay.

**But legibility and surprise are different axes, and we only built one.** Surprise needs the
hunter to arrive somewhere you were not watching. Three ways, in order of cheapness:

1. **It comes through a wall.** `_tooNarrowPanel` already makes a stage-3 hunter breach rather
   than squeeze. Generalise it: when a route is longer than a breach, it breaches. **A wall
   bulging and then bursting beside you is the single best scare this engine can already
   render**, and the wall group is the project's strongest work.
2. **Silence as a state, not an absence.** Add a STALK behaviour where it deliberately stops
   making noise and closes. The tell still fires on commit — the surprise is in *where* it has
   got to, not in whether it commits.
3. **The absorb beat, seen.** `hunter.absorb` exists as a view. In play, a hunter that takes a
   limb and visibly *grows* in front of you is the game's own premise landing as a scare.

**A rule to protect the fix we already have:** never surprise by removing the tell. Surprise by
changing the *geometry* of the approach.

## 3. Attachments — purposeful is done; SATISFYING is the gap

Each of the five now has a distinct verb, verified by driven playtests: nailgun = fight,
ball = distract, oil = deny, grapple = escape, skates = outrun. `weapons.js` used to branch on
weapon name exactly once — to pick a tracer colour.

What is missing is **feedback weight**. ~~One measured bug explains most of it: `glowSprite()`
does not carry brightness — two stacked additive sprites at 0.94 opacity measure +1 luminance
over the backdrop.~~ ✅ **DONE 2026-08-04 (fx-glow), and the diagnosis above was wrong — kept
because the correction is the useful part.** Sprites carry exactly the radiance the arithmetic
predicts: read back out of the half-float target, two additive white sprites deposit **+1.70
linear** at their centre. Three other things were happening:

1. **The tone curve.** The studio cyc sits at a LINEAR RADIANCE of 2.2–3.6, and ACES maps that
   whole range onto LDR 204–207 — about **one 8-bit level per unit of radiance**. Anything a
   normal blend or a unit-brightness additive layer can do is bounded by 1.0, so neither can
   move that backdrop. The fix is a **MULTIPLY filter**, which divides a channel out of the
   shoulder and into the part of the curve that still has slope. Same mechanism already on
   record for `lightPool` in `lighting/volumetric.js`. Measured, one sprite, one pixel:
   normal-blended orange over the whole area at 0.42 moved the cyc 207/206/205 → 205/204/202;
   the same sprite as a multiply moved it to 209/188/168.
2. **`toneMapped: false` is a no-op here** and always was — `engine.js` sets
   `renderer.toneMapping = NoToneMapping` because the composite tone-maps instead. The
   previous attempt at this bug turned that knob; flipping it on every sprite in the scene
   moves four separate cyc references by 0–1 level.
3. **Render order.** The two skates are mirror images (`scale.x = -1`), which flipped the
   transparent sort between the feet: the same additive cores deposited +1.70 radiance on the
   left skate and +0.06 on the right, where the plume ellipsoids drew over them.

Measured after: nailgun cyc beside the gun **r−b +1 → +62** at the hottest station against the
bar art's +62; skate jet core **L139 → L249** against a cyc of L220, where the art has L255
against 231. Also found and fixed: **`gadget.oil` had never once photographed its own arc or
burning splash** — `views/gadget.js` primed the trigger at t=0.5 s and captures land at
t≈0.20 s, so `burn` was 0 in every shot ever filed on that piece.

Then per gadget, the smallest thing that makes it feel good:
- **nailgun** — muzzle flash that lights the wall, and nails that *stick* in it.
- **ball** — it should bounce (it is still a hitscan that emits noise at the impact point) and
  the bounce should be audible-looking: dust puff, a mark, a visible arc.
- **oil** — it burns for 6 s and denies ground; the fire needs to *light the room* it is denying.
- **grapple** — the line is the whole feel. Draw the rope, keep it taut, lean the body against it.
- **skates** — sparks and a scrub mark on the carve; the slam needs a camera hit.

## 4. Destructible everything

Today: **8 hand-placed panels** in `spaces.js`, each with a stable network id. The wall system
under them is genuinely good — 5 stages (wallpaper → plaster → lath → beam → open), damage
carrying through stages, debris and dust, and `wall.sheet` holds the project's only
critic-awarded PASS.

**The most valuable property is already there and underused:** each stage carries
`blocksMove` / `blocksShots` / `blocksSight` / `climbable` *independently*. So a wall can reach a
state where you can **see through it but not walk through it** — the hunter's eye-lights visible
through a hole you cannot fit down. And at the beam stage it is **climbable**. That is a horror
mechanic and a traversal mechanic sitting unused in a table.

Going from 8 panels to "most of the map" is a **budget** problem, not a design one:
- 8 panels are already **32 of the game room's 37 meshes**. Architecture is cheap; *panels* are
  the driver.
- So: make every wall *segment* damageable, but keep the expensive multi-layer mesh stack for a
  pool of panels near the action, promoting a segment to a full panel when it first takes
  damage. Distant walls need one stage of state, not five layers of geometry.
- Budget reality: `game.play` is already ~2× over GPU budget in every space for a
  resolution-independent reason (the AO depth prepass re-traverses the scene). **That wants
  fixing before the wall count goes up**, or the two problems multiply.

---

## Recommended order

1. ~~**`glowSprite()` brightness.**~~ ✅ **LANDED 2026-08-04 (fx-glow).** See §3 — the cause was
   the tone curve's flat shoulder over a bright cyc, not the sprites, and the fix is a
   multiply filter plus an additive core with a real radiance. All six gadget views, plus
   `limb.detach` and `game.play`, re-rendered. Needs `critic-gadget-*`.
2. **The AO depth prepass.** Everything else in this document costs frame time; this is 2× back.
3. **Wire the net client** (after the cooldown-table fix). Nothing in §1 is real until two
   players share a room.
4. **Breach-to-surprise**: let the hunter choose a wall over a long route, and stage one
   scripted-feeling burst near the player. Uses the strongest system we have.
5. **Promote-on-damage walls**, once §2 has bought the headroom.
6. Per-gadget feedback polish, in the order in §3.

**Two decisions are John's, not an agent's:**
- **The win condition.** `play-critic-5` and `-6` both name it as the largest remaining gap —
  "no shape as a game" — and `-6` judged it *the majority of the distance left to PASS, more
  than everything else combined*. Escape the house? Survive a timer? Reassemble something?
  Every mechanic above points somewhere different depending on the answer.
- **Friendly fire.** The rules above assume players cannot dismember each other. That is a
  design stance, not a technical limit.
