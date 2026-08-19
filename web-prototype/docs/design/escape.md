# The win condition — escape the mansion

John, 2026-08-04: *"players escape the mansion for outside. Typical exits look chained or
blocked by the humans that started this survival situation for their entertainment. The real
exits are concealed or hidden, and require problem solving, destruction and risk."*

This closes the largest open gap in the project — both `play-critic-5` and `-6` named the
missing win condition as more of the remaining distance to PASS than everything else combined.
It also, unusually, makes several systems that already exist finally *mean* something.

---

## 1. Why this fits what is already built

**Destruction is already risk.** Breaching is loud, and `HunterAI._sense` scales hearing by
`Player.noise` — sprinting and firing are the loudest things you do. So the act required to
escape is the act that summons the thing hunting you. **That tension is already implemented and
currently has no purpose.** Give it one and the core loop writes itself.

**The wall stage table already contains the design's best beat**, and it was not built for this:

| stage | blocksMove | blocksSight | blocksShots | climbable | health |
|---|---|---|---|---|---|
| wallpaper | ✓ | ✓ | ✓ | — | 40 |
| plaster | ✓ | ✓ | ✓ | — | 70 |
| lath | ✓ | ✓ | ✓ | **✓** | 55 |
| **beam** | **✓** | **✗** | **✗** | **✓** | **90** |
| open | ✗ | ✗ | ✗ | — | — |

At **beam** you can see daylight through the studs, shoot through them and climb them — and you
still cannot get out. It is also the **most expensive stage in the table**. So every exit ends
with the longest, loudest, most dangerous push in the run, performed while freedom is visibly
one board away. Nothing needs building for that; it needs *using*.

**Each gadget already maps to a different kind of exit** — which is how "purposeful and
satisfying" stops being a polish task and becomes structural:

| gadget | `rules.js` says | the exit it opens |
|---|---|---|
| **oil** | ⚠️ **52 dmg, *"burns through plaster fast"* — MEASURED FALSE: 49.5 dps against the nail gun's 200.** The claim is wrong in `rules.js` too. | it lights the room while it burns, which is real; it is **not** the fast way through anything |
| **nailgun** | 26 dmg, 0.13 s | chip anything, slowly, safely, from range |
| **grapple** | 26 m — the longest reach in the game | exits you cannot walk to: high windows, a gallery balcony, across a gap |
| **skates** | 9 m/s vs a 3.35 hunter | not for opening — for **surviving the last 30 m** once it is open |
| **ball** | a noise where you are not | buy the seconds the beam stage costs |
| **limbClub** | 34 dmg, your own arm | the desperate option when you have spent everything |

## 2. The chained exits — storytelling that costs nothing

Every *obvious* way out is visibly, deliberately denied: the ballroom's front doors chained and
padlocked; gallery windows boarded from the **outside**; the service door welded. A padlock is
**human-made** — in a house of robots it can only mean a person did this, which tells the whole
premise without a word of text.

Dress it so the audience is implied, not explained: cable runs and a camera bracket in a
corner; chalked tally marks by a door; a folding chair and a thermos in the gallery. **Never
explain it.** The player should work out that they are entertainment.

Mechanically these are `blocksMove: true, damageable: false` — a wall you cannot chew. That
matters: **the first thing the player learns is that force alone does not work**, which is what
makes the concealed exits a discovery rather than a chore.

## ⚠️ 3a. CORRECTION (`escape-owner-1`, 2026-08-04) — TWO OF THE FOUR EXITS BELOW ARE IMPOSSIBLE

**The game has no vertical axis.** `Player.update` ends with `this.pos.y = this.world.floorY`
**unconditionally, every frame**, and `grappleTo()` is XZ-only. There is no jump, no fall, no
climb — nothing can leave the floor plane by any input the game accepts.

That kills two of the four designs below as written:
- **§3.1's chapel WINDOW** — "visible from the floor, unreachable… the grapple is already lying
  in the chapel" — is unreachable by *any* input, not just by walking. Built instead as a
  **chapel vestry door**, which keeps the beat that matters: the chapel is a dead end, and a
  stage-3 hunter must breach the wall to follow you in.
- **§3.3's coal chute** would need a floor hole *and* a way down. Built instead as the
  **gallery's boarded bay**.

**And `STAGE_DEFS.climbable` IS DEAD CODE** — `isClimbable()`'s only caller in the whole repo is
`harness/test-wall.mjs`. So §1's "at beam you can climb them" was **never true in play**; the
table entry is real data that nothing reads. The rest of the beam beat stands and is used: at
beam you can **see and shoot through but not walk through**, at the table's highest cost.

The lesson generalises: **a flag in a data table is not a feature until something reads it.**
Everything vertical in this design is a feature request against the player controller, not a
level-design choice — cost it as such before promising it.

## 3. The real exits — concealed, and each a different problem
*(Written before the correction above. §3.1 and §3.3 are kept for their reasoning, which still
holds if a vertical axis is ever built; what shipped is in §3a.)*

Four candidates, one per skill, placed so the mansion's existing geometry does the teaching.
**Three of four should be enough for a run**, so there is a choice rather than a checklist.

1. **The chapel window** (chapel spur) — visible from the floor, unreachable. The **grapple**
   is already lying in the chapel. Risk: the chapel is a dead end, and a stage-3 hunter cannot
   follow through the 1.20 m door — **it breaches the wall instead**, which is already
   implemented. Escaping here means being cornered on purpose.
2. **Behind the study panelling** (study_w or study_e) — a servant's passage. Concealed: the
   bays are identical, and one sounds different / is subtly newer. Needs **destruction through
   plaster** — the oil gun's stated speciality — and the study is small, so the noise is close.
3. **The coal chute / cellar hatch** (service passage) — the narrowest space in the house, the
   worst place to be found. Needs the floor or a hatch cover broken. **Reward: it exits low and
   the hunter is huge.**
4. **The ballroom's boarded orangery doors** — the biggest room, the longest sightlines, the
   most exposed. Beams behind the boards; slow to open, nowhere to hide while you do it, and
   the **skates** are in the ballroom for the run afterwards.

**Concealment should be honest.** Not hidden switches — hidden *evidence*: fresh mortar, a
draught moving dust, a rug that does not match, daylight in a seam. The player should be able
to say "I should have seen that" rather than "how was I supposed to know".

## 4. The loop this creates

Explore (unthreatened) → find the obvious exits chained → learn force is not the answer →
find a concealed one → **the work of opening it makes noise** → the hunter comes → break
contact, or fight, or distract → return and finish → run for the gap while it chases.

That is a horror loop with a shape, and every beat uses a system that already works: the
perception ladder, the commit tell, the five-stage walls, the gadget verbs, the noise model.

**Multiplayer makes it better rather than more complicated.** One player breaking a wall is a
siren; a second player's job is to be somewhere else being loud. The decoy ball stops being a
gimmick and becomes a role. And the cheek writes itself — *leaving with the exit half-open
behind you* is the funniest betrayal in the design.

## 5. The decisions — John, 2026-08-04

All three open questions answered, and the answers brought an endgame with them:

> *"Exits shouldn't be learnable. They should be procedural or convincingly different so it
> doesn't just become a speedrun away from the hunter. The hunter can follow you outside.
> Eventually each map will have an escape point. Player scores differentiate per the time it took
> to get to the escape point. The first player to escape should trigger a wind down. There should
> be a bomb threat with time ticking down where the whole mansion explodes at the end. The hunter
> should also gain advantages to catch the remaining players."*

This is a **complete game shape**, and it resolves the one thing §4 could not: what the first
escape *costs*. It is also the answer to the premise. The people running this staged a show; a
show has an ending time, and they are not leaving the evidence standing.

**The load-bearing consequence: escaping first is simultaneously the best score and the most
hostile act in the game.** You do not merely leave your friends behind — you start the clock that
kills them. That is the cheek from `gameplay-plan.md` §1 promoted from a prank to the central
social mechanic, and it costs no new system to say.

## ⚠️ 6a. CORRECTION (`play-critic-7`, 2026-08-04) — §6's PRINCIPLE IS NOT DELIVERED BY WHAT SHIPPED

The game **can be won** — four escapes, four sites, three locks, real WASD and real mouse-look, in
**8.78 / 10.73 / 12.14 / 14.83 s**. But measured in play, §6's promise fails on two counts:

**1. THE OPERATIVE TELL IS ELIMINATION, NOT EVIDENCE.** With only **four fixed sites**, you find
the live exit by *counting padlocks*. The critic's sentence is the one to keep: *"Nobody will ever
say 'I should have seen that', because there is nothing to see and nothing to miss."* Measured,
the daylight seam is **invisible at 17 m** (mean luma 4.02 live vs 4.01 chained, worst per-row Δ
0.2) and only separable at **9 m by the chain and hasps** — not by light. At 2.6 m it is a
hard-edged white ring of uniform width on all four sides: a lit rectangle, not sunlight.

**The design said 12–16 sites and FOUR shipped, and that is the whole difference.** Elimination is
only a strategy while the pool is small enough to enumerate. **Either the pool must be large enough
that counting is impractical, or the tell must carry at range — and it should be both.**

**2. THE LOOP HAS NO SIEGE IN IT.** Opening an exit takes **1.3–2.5 s**, and `run.js`'s own
docstring is out by ~8× — it says "about 10 nail-gun *seconds* per stage" where the code gives ~10
*rounds*, i.e. 1.3 s at a 0.13 s cooldown. **The beam stage — §1's self-declared best beat, the
longest loudest push in the run — lasts 1.3 seconds.**

**And destruction is SILENT: nothing in the destruction path calls `hearNoise`** (0 calls in 60 s
of demolishing a wall). Controlled A/B with the hunter staged identically: **60 s holding the
trigger → never left PATROL, closest 15.4 m; 60 s in silence → never left PATROL, closest 15.5 m.**
At 9 m the mechanism works fine (ALERT in 0.6 s), so it is not broken — it has **no reach, and the
job is over before anything can hear it.**

So §1's claim that *"the act required to escape is the act that summons the thing hunting you"* —
the load-bearing sentence of this entire document — **is not true in the build.** It is two
numbers away from being true: **call `hearNoise` on every stage transition, and raise the live
exit's stage healths ~5–8× so opening runs 15–30 s.** Every promise here (the risk, the ball decoy
having a role, "return and finish", the beam stage being visible-but-impassable, the hunter having
any purpose in the endgame) hangs on that. **It is a number change, not a system.**

## ✅ 6b. §6a WORKED (`escape-owner-2`, 2026-08-04) — and three of its numbers were wrong

§1's load-bearing sentence is **true in the build now**, and it is measurable rather than
asserted. `harness/scenarios/eo2-siege.mjs` is the instrument: it runs BOTH arms in one build,
one page and one station, with the "before" arm being the *same panel* with `WallState.defs`
swapped back to `STAGE_DEFS` — same weapon, same aim, same hunter staging, same clock.

**Seed `s4` (the chapel vestry, 37.3 m from the hunter spawn — §6a's own staging), trigger held:**

| lock | before | after | | hunter, working | hunter, silent control |
|---|---|---|---|---|---|
| boarded | **1.23 s** | **25.08 s** | ×20.4 | SEARCH at 2.9 s, closes to **25.7 m** | 36.4 m |
| plaster | **1.08 s** | **22.15 s** | ×20.5 | SEARCH at 3.9 s, closes to **26.8 m** | 36.4 m |
| beams | **0.48 s** | **15.52 s** | ×32.3 | one transition, at the end | 36.4 m |

**Every stage transition is heard now — 8 of 8, from 37 m.** Before the change: 0 calls in 60 s.

⚠️ **THREE THINGS §6a ASSERTED DID NOT SURVIVE MEASUREMENT.**

1. **"raise the healths ~5–8× so opening runs 15–30 s" CANNOT BE BOTH.** The `boarded` lock is
   255 hp and the panel takes ~196 damage/second measured (26 / 0.13 s); 5–8× of 255 is
   1275–2040 hp, i.e. **6.4 to 10.4 seconds**. The multiplier and the outcome in the same
   sentence disagree. The OUTCOME is the spec, so that is what `EXIT_DEFS` is solved for — about
   **19× on the total and 33× on the beam stage**, which is the stage the design says it wants
   the player to spend their time in and which was **less than half a second**.
2. **`hearNoise(point, 1)` WOULD HAVE BEEN A NO-OP, AND SO WAS 1.9.** The parameter is
   "how far this carries, in gunshots" — `hearNoise` refuses at `d > hearRange * strength`, and
   `hearRange` is 14 m. §6a's own measurement says the patrol never comes within 15.5 m of the
   vestry door, so strength 1.0 would have been refused on every frame and the A/B would have
   come back identical a second time. **1.9 (26.6 m) was also refused**: over the whole 25 s
   siege the hunter sat at 37.1–37.3 m and never moved toward it. It is **3.4 → 47.6 m**, which
   is the whole house, because that is what "the act that summons the thing hunting you" says.
   It can afford to be that loud because `soundCeiling` (0.86) is below `commitAt` (1.00): the
   noise sends it to LOOK, four times over a 25 s job. Sound never commits it.
3. **"the oil gun burns through plaster fast" is not a wall-speed claim that holds.** Oil is 52
   damage on a 1.05 s cooldown = **49.5 dps** against the nail gun's 26 / 0.13 s = **200 dps**.
   The nail gun is the wall tool by 4×, and the `plaster` lock is not "the run where the right
   tool halves the work" — it is the run with one stage less to chew. Left alone and reported;
   fixing it is a `rules.js` change and this round did not own that file.

**And the pool is FOURTEEN.** §6.1 asked for twelve to sixteen and four shipped; that was §6a's
first finding and the only one that is authoring rather than tuning. Over 512 seeds all fourteen
appear and the worst share is **7.8%** (it was 26.2% with four); 200 repeats of one seed still
give one outcome, and two independent `RunState`s still agree. Every site has its own yard in
`game/exterior.js`. ⚠️ **Appending re-rolls every seed** — the choice is a pure function of
(seed, pool ORDER) — so `seed=s0` no longer means the chapel. `?exits=4` rebuilds the house
exactly as it was, panels and wall cuts included, so the cost of the decision is measurable.

**AND THE CRITIC'S OWN DRIVER STILL WINS.** `pc7-play.mjs`, unmodified, on `seed=s4`: **escaped at
29.06 s** — walk 7.6 s, open 16.3 s, out 2.2 s, 10 passed / 0 failed. Its four runs before this
round were 8.78–14.83 s with opens of 1.3–2.5 s, so the whole difference is the siege.

**AND A COMPETENT PLAYER STILL GETS OUT.** `harness/scenarios/eo2-competent.mjs` plays §4's loop
with real keys — go, work, break contact when it commits, come back, finish, run — and on seed
`s4` (chapel vestry, `beams`) it **escaped at t = 27.88 s with all four limbs and zero retreats**
(walk 7.6 s · siege 15.4 s · out 2.5 s). The same site on the previous build was 14.83 s, so the
siege costs about thirteen seconds and nothing else. ⚠️ **The exposed case is not answered**: at
the ballroom orangery, with the hunter spawning 9 m away, the driver was pushed off the wall 0.4 s
after arriving and then could not navigate back through D7 — an instrument failure, stated as one.

**Still open after this round, stated rather than glossed:**
- **The `beams` lock has exactly one stage transition and it is the last thing that happens**, so
  that 15.5 s job is inaudible beyond the gun's own 12.5 m until it is already over. Arguably
  correct — there is nothing to knock down until the studs go — and it pairs with `beams` being
  the lock whose yard is visible from the first frame. Reported, not designed around.
- **§10.4's countdown HUD is still not built**, so a player standing in the yard in WINDDOWN is
  told *"N STILL INSIDE — YOU STARTED THE CLOCK"* once and then has no clock at all.

## 6. Unlearnable without being unfair — *learn the tells, not the map*
*(The principle stands; §6a records that what shipped does not yet deliver it.)*

The failure mode to design against is not "too easy", it is **randomness that reads as
unfairness**. Nobody enjoys losing to a house that hid the answer. The distinction that makes
this work:

> **The answer changes every run. The skill does not.**

Concretely, three dials, in descending order of cost:

1. **A pool of authored sites, not generated geometry.** Twelve to sixteen candidate exits, each
   hand-built to the estate's quality bar with its own dressing and its own verb. Per run, the
   pool is *selected from*, never invented. Procedural **choice**, authored **content** — the
   only version of this that can be beautiful.
2. **The decoys ARE the chained exits of §2.** Every site not chosen this run is present, visible
   and padlocked. So the chained-exit storytelling and the shuffle are the *same feature*: what
   varies is which one is live, and the house always looks deliberately sealed.
3. **The lock varies even when the site does not.** The study panelling might need fire this run,
   sustained damage through beams the next, and a grapple across a collapsed floor the third.
   Same geometry, different problem — the cheapest variety in the design, and it keeps a
   remembered site from becoming a remembered *answer*.

**What stays constant is the reading.** Fresh mortar, a draught moving dust, daylight in a seam,
a bay that does not match its neighbours — those tells mean the same thing in every run and on
every future map. A veteran gets faster because they *read the house faster*, not because they
memorised a coordinate. That is mastery worth having, and it is the only kind that survives the
map count going up.

**One live escape point per map per run** (John: *"eventually each map will have an escape
point"*). Singular is the right call: it concentrates the endgame in one place, which is what
makes the bomb, the hunter's advantages and the other players all collide somewhere.

⚠️ **The selection must be seeded and deterministic**, derived from a run seed the server owns.
Two clients disagreeing about which exit is real is the worst desync this game could have.

## 7. The wind-down — the best thirty seconds in the game

The moment the first robot is outside:

| beat | what the player inside experiences |
|---|---|
| **the announcement** | the house speaks — the humans do, rather. Lights come up. It should feel like a channel cutting to the finale. |
| **the clock** | a countdown, visible, unignorable. The only HUD element in the game allowed to shout. |
| **the door is open** | the escapee's breach stays breached. **The first escape gives away the answer** — which is the compensation, and the tension: everyone now runs to the same hole, and so does the thing hunting them. |
| **it gets off the leash** | see below. |
| **the house goes** | §8. |

**The hunter's advantages should come from systems that already exist**, so this is drama rather
than a new AI:

- **Promotion.** `HunterAI._grow()` already stages the transition with dust, a flare and an
  unfolding rig, and `HUNTER_SPEED = [0, 2.05, 2.70, 3.35]` already pays out speed per stage.
  Uncaging it *is* a forced growth — the most spectacular thing the game can already render,
  arriving at the exact moment it means the most.
- **It stops losing you.** `loseAfter: 2.2` and `searchFor: 9.0` extended, or contact simply not
  dropped. The stalker becomes a pursuer.
- **The audience helps it.** A periodic sweep that hands it your position — diegetically, the
  people watching turning the lights on. Better than buffing its senses invisibly, because the
  player can *see* the moment they are given away and can plan around the interval.

⚠️ **The trap to avoid, stated plainly:** if the wind-down is unsurvivable, the optimal play is
always "escape first and never help anyone", multiplayer collapses into a race, and every social
mechanic in `gameplay-plan.md` dies. **The wind-down must be winnable by a good player who was
across the house when it started.** That is a measurable claim — drive it in `harness/playtest.mjs`
from the worst corner and see. Note that a stage-3 hunter **cannot fit D7 (1.20 m)**, so the
promotion hands the players one exploitable weakness at the same time, which is the kind of
trade the rest of this design is built from.

**Timer length is an open number, not a decision.** 90 s is a starting hypothesis only — the
patrol lap is ~185 s and a cross-house sprint is on the order of 20 s, so the honest procedure is
to measure escapes from the far corner and pick the value where a skilled run makes it and a
panicked one does not. **Assume 90 is wrong until it is measured.**

## 8. The house goes

The explosion is the run's punctuation, and the destruction system is already the right
instrument: a wave of stage transitions sweeping outward, every panel driven to `open` with the
debris and dust bursts it already emits, ending in whiteout and the results screen. **It reuses
the project's strongest, most critic-approved code** rather than inventing a set piece.

Two things it says for free:
- **The humans destroy their own monster.** Unless it followed someone out — in which case it is
  standing in the garden with you when the house goes up behind it, and the next map has a
  reason to exist.
- **Nothing was ever going to be left of the house.** Which retroactively justifies letting the
  players tear it apart for an hour.

## 9. Score

**Time from run start to reaching the escape point**, per player, lower is better. Everyone who
gets out before the bomb scores; the survivors are ranked, the dead are not. It is legible, it
needs one timestamp, and it makes the wind-down runners into a real leaderboard fight rather
than an afterthought.

(Deliberately *not* built in yet: bonuses for limbs kept, damage dealt or teammates saved. Time
alone is honest and shippable; the moment it proves to reward something dull, revisit it with a
measurement rather than a hunch.)

## 10. What has to be built (in order)

1. **The run state machine** — `EXPLORE → WINDDOWN → DETONATION → RESULTS`, in its own module,
   authoritative-server-shaped from the start even though `net/client.js` is not wired yet. Every
   later item hangs off this, so it comes first and it is worth getting cleanly separated from
   `views/game.js`.
2. **Exit sites + seeded per-run selection.** Extends `spaces.js`'s `PANELS` table rather than
   replacing it — those ids are a network protocol surface and must not be renumbered. Chained
   sites are `blocksMove: true, damageable: false`; the live site is a normal breach target once
   its concealment is read.
3. **The win state.** `game.js` has a death screen (`buildDeathWatch`) and no victory. Escaping
   needs at least the same weight, plus the run timer and the results board.
4. **The wind-down**: countdown HUD, hunter promotion, the sweep, and the measured timer value.
5. **The detonation** — the cascade, the whiteout, the hunter's survival case.
   → **FOURTEEN SITES as of 2026-08-04** (`escape-owner-2`), which is §6.1's own number. See §6b.
6. **Dressing**: chains, padlocks, boards, the camera bracket, the folding chair. Estate-owner
   work, cheap, and it carries the entire premise without a word of text.
   → **chain, hasps and padlock BUILT** (`src/game/exterior.js` `buildChained`, one merged mesh
   per site). The camera bracket, the chalked tallies, the folding chair and the thermos are not.
7. **Concealment cues**: the draught, the seam of daylight, the mismatched bay, fresh mortar.
   → **BUILT and measured** (`exterior-owner-2`, 2026-08-04). All three cues fire on every live
   site and none on a chained one: a seam of daylight at the joint, a draught of motes carrying
   inward, and a cold patch on the floor. **They are deliberately independent of the LOCK**, so
   the reading is the same in all three of §6.3's variants — a tell that only fired on one lock
   would be unlearnable two runs out of three.
   Measured by flipping ONE site between live and chained with the run seed, which holds the
   geometry and the lighting fixed: **+20.3 luma on the jamb strip, in both phases of the room's
   breathing lights, and COLD (r−b +0.3) against this grade's deliberately warm shadows.** Numbers
   and the method are in HANDOFF under "THE OUTSIDE IS WIRED IN".
   ⚠️ Open, and a look critic's call rather than a builder's: the seam traces the aperture
   *exactly*, which can be read as a hidden switch that lights up rather than as hidden evidence.

**Also now built, and it is what makes item 7 mean anything:** there is an OUTSIDE to leak. One
baked daylit yard per site — court, lawn, garden or north ground — resident only while an exit
actually exposes it (+3 draw calls at an open hole, +1 anywhere else). Before it, an opened exit
was a black rectangle, because `scene.background` is `#05070b` and there was nothing beyond.

**What must be measured, not asserted** (this project has burned five lying instruments and a
dozen unsourced numbers): the bomb timer; whether the wind-down is survivable from the worst
corner; whether a promoted hunter can actually reach the live exit before a player crossing the
house; and whether the seeded selection is identical on two clients from the same seed.
