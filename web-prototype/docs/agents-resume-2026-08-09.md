# RESTART PACK — 2026-08-09, four agents killed mid-slice by a usage limit

**Read `HANDOFF.md` first. This file exists only to say what four dead agents were holding when
they died, so their work is resumed rather than re-derived.** The limit reset at **18:20
Australia/Brisbane**; all four died between 18:05 and 18:19, none filed a report.

⚠️ **NEVER TRUST A DEATH NOTIFICATION'S QUOTED PROGRESS.** The last line of a killed agent's
transcript is where it *was*, not what it *finished*. Everything below is either (a) read off
disk by the coordinator afterwards, or (b) explicitly flagged as unverified.

✅ **The tree parses and builds green** (`lint-glsl` 395 files, `npm run build`) — checked
immediately after the deaths. **But four agents were mid-edit, so a change can be syntactically
fine and semantically half-done.** John is playing from `dist/` on a live tunnel. **Run the gates
before trusting anything below.**

Files written in the last 90 minutes before the deaths:

| time | file | agent |
|---|---|---|
| 17:02 | `src/game/room.js` | `passfail-1` |
| 18:05 | `src/destruction/debris.js` | `debris-1` |
| 18:09 | `src/destruction/damagefield.js`, `src/game/wall.js` | `passfail-1` |
| 18:16 | `src/game/player.js`, `src/game/sledge.js` | `cam-1` |
| 18:17 | `src/views/game.js` | `cam-1` |

New harness files that survived: `_pf1-diag.mjs`, `_pf1-diag2.mjs`, `_cam1-occlusion.mjs`,
`debris-floor.mjs`, `debris-collapse.mjs`, `_dark1-recon.mjs`.

---

## 1. `passfail-1` — 🎯 IT GOT THE ANSWER. DO NOT RE-DIAGNOSE.

**Task:** John dug a big hole in the gallery and could not walk through it, barrier on or off.

**H1 CONFIRMED, and the measurement is in `harness/scenarios/_pf1-diag2.mjs`'s own header:**

> `_pf1-diag.mjs` established that **after `[B]` the near face is open (1.46 m channel) and the
> TWIN is untouched and solid, and a body is refused.** The twin's four layer planes are
> `FrontSide` facing ITS room (`wall.js` only flips the **scalar** arm to `DoubleSide`), so the
> question is whether the invisible wall reads as a way through.

🎯 **JOHN DIAGNOSED THE SECOND HALF HIMSELF, UNPROMPTED, AND HE IS RIGHT:**
> *"I think part of it is that you can't see the back side of the other wall and thats why im
> unable to see the bits I can't get through."*

So the failure is two things stacked:
1. **Depth is per side.** You dig inward from your own side and stop at the boundary. The twin
   panel has its own `WallState` and its own depth, still 0. `[B]`'s `setBarrier(false)` clears
   the barrier CELLS on every dig panel but **digs nothing**, so an intact wall remains.
2. **That intact wall is INVISIBLE from where the player stands.** `aperture-1` flipped only the
   scalar arm to `DoubleSide` — deliberately, because a free face already has a twin facing the
   other way. The consequence nobody drew: once you have dug through your own side, the twin's
   planes are backface-culled from your eye, **so you see into the next room and cannot walk
   there, with nothing on screen explaining why.**

⚠️ **`[B]`'s on-screen promise is therefore a lie.** It prints *"BARRIERS OFF — DIG ANYWHERE"*,
which is a claim about getting through.

**The four questions `_pf1-diag2.mjs` was written to answer and never got to run.** They decide
what the fix is, so **run it first — do not start by editing:**
- **P1 THE PICTURE** — photograph the breach after `[B]` with the grid read in the same page at
  the same instant. Does the invisible wall read as a way through?
- **P2 SELF-REPAIR** — one more blow at the rim fires `_couple()`. **Does one swing fix it?** If
  so the bug is intermittent, which is worse to report and easy to mis-diagnose.
- ✅ **P3 THE REAL UNLOCK — LARGELY ANSWERED AFTER THE DEATHS, AND IT IS GOOD NEWS.** The
  coordinator re-ran the gates serially on the post-death tree: **`dig-free` 15/15**, and two of
  its checks bear directly on this. **F5 shoves an actual robot body at a dug hole and it ends
  past the face** (*"the hole you dug is a hole you can walk through"*), and **F6 reports
  `digCensus().freePassable` = 2 faces passable after the discovery** (*"one discovery drops every
  barrier in the house"*). **So the shipped interconnect path is NOT broken — `[B]` is the
  outlier.**
  ⚠️ **This is strong evidence, not proof of John's exact case.** F5/F6 exercise the interconnect
  segment, which is *supposed* to open. **Still unanswered: a DUD face dug to the barrier and then
  unlocked — is it passable from the side the player dug?** That is the case John was in. Run
  `_pf1-diag2.mjs` P3/P4 to close it, but **do not treat it as a five-alarm fire any more.**
- **P4 THE PAIR INVARIANT, SWEPT** — two faces of one wall band cannot disagree about whether
  there is a hole in it. Measure how often they do.

⚠️ It had edited `damagefield.js` and `wall.js` at 18:09 — **unverified, purpose unknown.**
Diff-read them before building on top.

---

## 2. `cam-1` — was on John's two live blockers, state unknown

Died at *"Now the reset audit in `views/game.js`"*, having written `player.js`, `sledge.js` and
`views/game.js` at 18:16–18:17. **Whether pointer lock landed is UNVERIFIED — check the file.**

Its queue, in John's priority order:
1. 🚨 **Pointer lock survives alt-tab and captures the desktop cursor.** Release on `blur` AND
   `visibilitychange`; pause the loop while hidden; re-acquire only on an explicit click (a
   programmatic re-lock fails silently — browsers need a gesture and enforce a cooldown).
   ⚠️ `requestPointerLock()` returns a promise and `main.js`'s `unhandledrejection` handler paints
   **"VIEW … FAILED"** over the whole game. Defend every lock/exit call.
2. 🚨 **Movement input runs forever after an escape.** `Input.keys` is a held-key set cleared only
   by `keyup`; the escape transition eats the keyup. Clear `keys` **and** `once` on blur,
   visibility change, lost pointer lock, and every round-state transition. ⚠️ `once` is the latch
   that fixes the E/Q dropped-keypress bug — clear it on transitions, not per frame.
3. 🚨 **Ghost sledge after a respawn** — the prop stays parented and drawn while `owned`/`equipped`
   are cleared, so it floats and the game thinks he is unarmed. Reset must take both or neither.
   The hammer returning to the floor is probably correct (John's own *"start unarmed"* direction);
   the ghost is the bug.
4. **"Everything needs to be reset properly"** — enumerate what a round owns and check each:
   held/equipped, detached limbs, loose pickups, dig damage on every panel, barriers and the
   interconnect, debris, dust, HUD prompts, camera, timers, `barriersOff`, black point.
   ⚠️ `resetRound()` already re-arms `barriersOff` deliberately — read its comment first.
5. **A dig-speed key John asked for**, same one-key pattern as `[B]`/`[G]`: scale damage per blow,
   ×0.25 → ×4, shipped value as the default arm, name the level on screen, **unreachable from
   `?capture=1` or any scenario** or it invalidates `dig-band.mjs`. Scale damage, **not**
   `WEAPON_COOLDOWN` — the swing's rhythm is choreography John has never complained about.
6. **The camera** (deferred, see §5).

🚨 **GATE GAP: `mechanics.mjs` has never once exercised a round reset.** One check that dies,
retries and asserts the world matches spawn would have caught bugs 2, 3 and 4. Write it, and
validate it by reintroducing.

---

## 3. `debris-1` — had reached the collapse payout

Died at *"Now the view's `onChunk` — the collapse payout and the slab burst"*, having written
`debris.js` at 18:05. Left `harness/scenarios/debris-floor.mjs` and `debris-collapse.mjs`.
**It owns `views/game.js`'s `onChunk` handler** (reassigned mid-flight; `cam-1` has the rest).

🎯 **Its own best finding, and it is the real cause of the clean floor:** the debris pool is a
**ring buffer that recycles the oldest piece**, so *"resting pieces fill the pool and get
recycled"* — the floor is not clean because too little spawns, it is clean because **what lands
is deleted to make room for what is still flying.** ⚠️ It had not finished confirming this
against the two competing explanations (pool scaled by `quality.particles`; pieces falling through
or behind the wall). **Settle it by measuring.**

**The architecture that follows and also solves the draw-call limit:** a piece at rest is not a
particle. **Retire settled debris out of the live pool into a persistent pile** — one instanced
mesh, one material key, transforms baked. Frees the ring buffer, accumulates without bound, costs
**one draw call** however deep it gets.

🎯 **John reframed this slice mid-flight and it is now a gameplay mechanic:**
> *"extra pieces to break off if much of the wall has already been cleared around it… like
> Teardown… **This could create an efficiency for the player to utilize as a skill** — how
> effectively they can break down large segments with the least hits."*

**Support, not connectivity.** `disconnection.md`'s flood fill tests full *severance*, which a
radial dig never produces — that is why it "fires on nothing". A cell with most neighbours gone is
**unsupported** long before it is disconnected, and a support test fires constantly. It must be
**legible enough to learn** — if collapses look random there is no skill, only luck.

⚠️ Headroom is **~24 draw calls** at the pessimal station (601/625 with every face in the house
dug), not 199. ⚠️ Collapsed cells are cleared for movement and the AI's BFS too — check
`pathPortals()` agrees with the picture.

---

## 4. `dark-1` — barely started, respawn from scratch

Died 6 m in at *"write the reconnaissance scenario"*. Left `_dark1-recon.mjs`; **assume nothing
landed.** Its two items are `critic-slice-3` #5 and #6: the **service passage zebra** of hard
joist shadows (proved NOT the black point — identical on all three arms) and **boarding rendering
as flat black cut-outs in 6 of 8 rooms** (load-bearing narrative: the boards are the "humans
staged this" tell). **First move for both is the invariance test** — multiply the hemisphere; if
the black thing does not brighten while its neighbours do, it is not lit at all and no amount of
light will fix it.

---

## 5. Deferred / unassigned

- **The camera**: the boom clips through the wall you are digging (John's screenshots show it
  looking back at the player through the hole), and the body covers **45.7–52.6%** of an opening's
  screen area. Both are one design problem at two distances.
- The dig band is **suspended** — John: *"I want to abandon a set time for dig while we testing."*
  **Report the clock; do not defend it.**
- `--pick` is blind to `InstancedMesh` and does not cull — use `harness/scenarios/_ap1-who.mjs`.
- ✅ `harness/still.mjs` landed: `hold()`/`release()` pin the live loop, floors **0.00%**. Use it.
