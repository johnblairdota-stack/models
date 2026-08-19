# Attachments — swapping, function, animation

Direction from John, 2026-08-03. Two decisions are LOCKED and the rest of this doc is
designed around them:

1. **Model C — the HUD rosette IS the inventory.** No menus, no backpack. The world is the
   only store; what is on the floor is what you have.
2. **A displaced arm is EJECTED TO THE FLOOR and recoverable** — never consumed. Fitting a
   gadget costs you the arm's use, not the arm.

---

## 1. What actually exists today (measured, not assumed)

| | damage | range m | cooldown s | implemented behaviour |
|---|---|---|---|---|
| `fist` | 14 | 1.15 | 0.55 | hitscan |
| `limbClub` | 34 | 1.95 | 0.72 | swing arc + body reaction (landed today) |
| `nailgun` | 26 | 22 | 0.13 | hitscan |
| `oil` | 52 | 12 | 1.05 | hitscan |
| `ball` | 9 | 18 | 0.28 | hitscan |
| `grapple` | 18 | 26 | 1.4 | hitscan |
| `skates` | 40 | 1.6 | 1.2 | hitscan (+ `MOVE.skateTop 9.0`, `skateAccel 6.2`) |

⚠️ **Every gadget is the same hitscan.** `weapons.js` branches on the weapon name exactly
once — line 185, to pick a tracer COLOUR. The distinct behaviour each one is named for does
not exist. The intent is written in `rules.js`'s own comments and in the numbers (ball: 9
damage at 0.28 s — "they are for reaching things"), so the table is a design brief nobody has
executed.

Rig facts that constrain everything below:
- Arm gadgets (`nailgun, oil, grapple, ball`) REPLACE an arm at `shoulderL/R`.
- `skates` are the documented exception: socket `shinBoth`, fitted OVER both legs, not a
  replacement.
- A detached gadget-arm lies on the floor as ONE item carrying its gun (`item.gadgetObj`);
  re-attaching reuses that object rather than building a second.
- Socket types are `empty | limb | gadget`. `fitGadget(socket, name)` returns `{ok, displaced}`
  — **`displaced` is already the hook Model C needs and is currently unused by the UI.**

---

## 2. The swap system (Model C)

### Controls
| input | action |
|---|---|
| `E` | act on the nearest item, targeting the **selected socket** |
| hold `E` (>250 ms) | cycle the selected socket; rosette highlights it |
| `Q` | drop what you are carrying |
| hold `Q` (>250 ms) | **eject the gadget on the selected socket** — the missing verb |

### Rules
- The rosette always shows one **selected socket**, defaulting to the first that can accept
  the item under your feet. It is the only "cursor" in the game.
- `E` over an item whose kind matches the selected socket:
  - socket `empty` → fit it.
  - socket `limb` → **eject the arm to the floor, then fit** (one press, one animation).
  - socket `gadget` → **eject that gadget to the floor, then fit** the new one.
- Kind mismatch (an arm over a leg socket) must **never** show a FIT prompt. ⚠️ It does today:
  the prompt reads `[E] FIT ARM` whenever `caps.wounds > 0`, without checking that *this* item
  fits *that* socket. Reproduced with an arm 0.1 m away and only a leg socket open — the game
  advertises an action it then refuses. Fix with the prompt, not with a silent no-op.
- Ejected parts are ordinary world items: they scatter, they can be re-fitted, the hunter can
  absorb them. Nothing is ever destroyed by a swap.

### Why this and not a loadout UI
The game's premise is that **your body is your inventory and every fit costs you something**.
A backpack turns a horror decision into a menu. The rosette already draws the four sockets, so
the "inventory screen" is a widget that is on screen at all times and needs no mode.

---

## 3. Function per attachment — what each one should DO

The point is that no two overlap, and each answers a different question the mansion asks.

**`nailgun` — the workhorse.** Stays as it is: fast, accurate, cheap, 22 m. The one that makes
a corridor defensible. It is also the tutorial weapon, so it must stay boring in a good way.

**`oil` — area denial.** Should stop being hitscan. Lob a viscous glob on an arc that **pools
where it lands and burns for ~6 s**, damaging anything crossing it. 52 damage is a *total over
time*, not per hit. This turns a doorway into a decision for the hunter and gives the player
the one thing they otherwise lack: the ability to shape space. Burns through plaster fast, so
it also opens routes.

**`ball` — reach, not damage.** 9 damage at 18 m is not a weapon and was never meant to be.
It should **bounce off walls** and be the tool for hitting what you cannot see: triggering a
noise across the map, knocking a chandelier, striking a panel around a corner. Pairs with the
hunter's hearing model — a thrown ball is a *decoy*, and that is a whole stealth verb the game
currently has no way to express.

**`grapple` — traversal and the hunter's counter.** 26 m, 1.4 s. It should **pull**: latch a
surface and haul the player to it (escape, or reach the gallery's high ground), and when fired
at the hunter, haul the *hunter* a short distance instead — a desperate, high-risk reposition.
This is the answer to "I am cornered".

**`skates` — commitment.** Already the exception: over both legs, `skateTop 9.0` vs a 5.2 run.
Should be **fast but unable to turn on the spot** (the constant already says so) — you outrun
the hunter in a straight line and pay for it in corners. The 40-damage "body slam" is a
contact effect while above a speed threshold, not a fired shot.

Read as a set: **nailgun = fight, oil = deny, ball = distract, grapple = escape, skates =
outrun.** One per verb, no overlap.

---

## 4. Animation plan

Every gadget needs the same four beats. The infrastructure exists: `swingKick`/`detachKick` in
`locomotion.js` fire impulses into per-channel springs, and that is how weight is expressed.

**a. FIT (~0.5 s), shared.** The one animation that sells the premise. Selected socket's limb
is ejected (it tumbles out with real velocity), the free hand brings the new part across the
body and seats it, the shoulder takes the load, and the whole body absorbs a settling impulse.
Reuse `detachKick` for the eject half so the ejection reads identically whether *you* did it
or the hunter did.

**b. IDLE / CARRY.** Each gadget rests differently: nailgun muzzle-down at the hip, oil drum
hanging heavy at knee height (already fixed — it was a pose bug, not a model bug), grapple
housing forward and ready, ball cluster carried in front at the waist. The heavy ones should
list the body, exactly as the club now does.

**c. FIRE + RECOIL, per gadget.**
- nailgun: minimal, high-frequency shoulder tick; heat ramp already runs muzzle-hot.
- oil: a heave — two-handed if the other arm is free, the body pitches with the lob.
- ball: an underarm flick, almost no recoil, body barely reacts. Contrast is the point.
- grapple: a hard THUMP on fire, then a **sustained pull** — the body leans against the line
  the whole time it is taut, which is the animation that makes it read as force.
- skates: no fire pose; a lean into acceleration and a hard carve when turning.

**d. EJECT (~0.35 s).** Shoulder rolls back, part tumbles free with real angular velocity,
body rebounds. Same spring layer.

---

## 4b. LANDED SO FAR (verified by driven playtests, not by reading)

- **Steps 1–3 of the swap system are in.** Honest prompts (it no longer offers a FIT the rig
  will refuse), `hold Q` ejects what is fitted, `hold E` cycles the targeted socket with a
  rotating dashed ring on the rosette, `tap E` fits to that socket, and fitting over an
  occupied socket ejects the old part in one press. Ejected parts are recoverable.
  ⚠️ **A swap only fires when it changes the CLASS of the socket** (gadget↔limb). Trading a
  healthy arm for another healthy arm is churn that costs a part and gains nothing, and is
  indistinguishable on screen from the control doing nothing.
- **`ball` is a decoy.** New `HunterAI.hearNoise(pos, strength)` — a noise that is not a body.
  Deliberately does NOT set `target` (a target is something `_attack` takes a limb from, and a
  ball has no rig), and is refused outright during PURSUE/ATTACK/GROW so a decoy can never
  cancel a chase it has already lost. Verified: PATROL→SEARCH, investigates the impact point
  (0.0 m from it, 1.7 m from the thrower), walks 3.4 m to it, refuses while committed.
  **Emergent constraint worth keeping:** the noise is heard from where the ball LANDS, within
  ~11.9 m, so hurling it at the far wall does nothing. You throw it PAST the hunter. That is a
  real skill and it fell out of the existing hearing model rather than being designed in.
- **`oil` is area denial.** Leaves a burning pool (1.35 m, 6 s) that damages what stands in it;
  the table's 52 is now a total over time (~2.17 per 0.25 s tick). Verified: pool appears,
  applies 5 damage ticks to a hunter standing in it, and burns out.
  ⚠️ **Honest limitation:** against the hunter this is currently *damage*, not real denial —
  the first tick's knockback tends to shove it clear of the pool, and the hunter has no reason
  to route around fire because pathing does not know the pool exists. **True area denial needs
  `_waypoint`/`_steerTo` to treat live fires as obstacles**, which is the follow-up and is
  where the verb actually becomes a decision for the AI rather than a scratch.
  ⚠️ **Testing note:** do NOT assert fire damage via `hunter.stun` — the fire adds ~8.7 stun/s
  against a 55/s decay, so it can never accumulate and the check fails on a working feature.
  Count the damage applications instead.

- **`grapple` pulls.** New `Player.grappleTo(point)` drives VELOCITY, not a teleport, so the
  existing collide-and-integrate still runs and the line hauls you into doorways honestly
  instead of through walls. Releases on arrival, on timeout, or the frame it stops making
  progress (a wall between you and the anchor) — a pull that grinds against geometry reads as
  a bug. Fired at the HUNTER it hauls the hunter instead: a desperate reposition that drags
  the thing toward you, which is why it carries the game's longest cooldown. Verified: 12.6 m
  player haul with a clean release; hunter dragged 7.9 → 6.3 m.
- **`skates` slam on contact.** `WEAPON_DAMAGE.skates` (40) existed and had never once fired,
  because skates have no trigger — the gadget was a movement mode with an unused table entry.
  Damage is now CARRIED, not aimed: above 6.0 m/s (against a 5.2 run) whatever you hit, you
  hit, and you bounce off it. Verified: 7.34 m/s charge landing one 40-damage slam.
  ⚠️ **Skates steer by `player.facing`, NOT `aimYaw`** — a test that sets only `aimYaw` sends
  the player into a wall and looks like a broken accelerator. They also fit through
  `rig.fitSkates()`, not `fitGadget` — socket `shinBoth`, over both legs, not a replacement.

**All five attachments now have distinct functions. `weapons.js` no longer branches on weapon
name only to pick a tracer colour.**

## 5. Build order (each step playable on its own)

1. **Honest prompts + `hold Q` eject.** Smallest change that makes swapping possible at all.
2. **Socket targeting on the rosette** (`hold E` cycle, highlight, default selection).
3. **One-press swap** (`E` over a full socket ejects then fits) + the shared FIT animation.
4. **Function pass, one gadget per round, in this order:** ball (decoy — biggest new verb for
   least code), oil (pool + burn), grapple (pull), skates (contact slam + carve).
5. Per-gadget fire/recoil animation alongside each function.

Each of 1–3 is independently shippable; 4 changes the game most and should not start until
swapping feels right, because it multiplies whatever the swap flow already is.
