# The procedural mansion — every door is a maybe-exit

John, 2026-08-04: *"I want the rooms we have built to be procedural and fit together in different
ways each time. the map can scale later by interconnecting more of the rooms even if it doesn't
make super logical sense. the interconnect between the rooms should be like the escape door so each
time you open one of these doors you don't know if it will lead outside or to another room."*

**This is the best structural idea in the project so far, and it fixes a defect a critic had
already proved by playing.**

---

## 1. Why this is worth doing before anything else in the design

`play-critic-7` escaped four times and then named the real problem: **the operative tell is
elimination, not evidence.** With a fixed floor plan and a handful of exit candidates, you find the
way out by *counting padlocks*. Its sentence is the one that matters: *"Nobody will ever say 'I
should have seen that', because there is nothing to see and nothing to miss."*

The planned fix was to enlarge the exit pool from 4 to 14 so counting gets impractical. **John's
idea is strictly better, because it removes the category the counting depends on.** If a closed
door might be a room and might be the outside, then:

- **There is no set of "exit candidates" to enumerate.** Every connector is one.
- **The chained/padlocked dressing now covers the whole house**, not four special places — so §2's
  storytelling (a padlock is human-made; someone did this to you) applies everywhere.
- **The floor plan itself stops being memorisable**, which is what John originally asked for in §6
  and what four fixed sites could never deliver.
- **Every breach becomes a gamble with a real cost**, because the siege is now 15–25 s and loud
  enough to be heard across the house (`BREACH_NOISE.exit` 3.4 = 47.6 m).

## 2. The beat this creates, and it is already built

**`STAGE_DEFS` sets `blocksSight: false` at the BEAM stage — the last and most expensive one.**

So the sequence is: you commit to a door, you spend 15–25 seconds making the loudest noise in the
game, the hunter starts moving, and **at the final stage you see through the studs and learn what
you bought.** Daylight, or another room.

That is a slot machine with a fifteen-second lever and a monster attached to the handle, and
**every part of it already exists.** No new mechanic — the reveal lands at exactly the stage the
wall table already makes the most expensive.

⚠️ **Design rule that follows: a closed connector must give NOTHING away.** Same jamb, same
architrave, same dressing, same sound. The moment a live exit is distinguishable while closed, the
whole idea collapses back into elimination. **The concealment tells from `exterior.js` (daylight
seam, draught, cold patch) must then be re-thought — they were built to mark the live exit, which
is precisely what this design forbids.** Either they go, or they become *unreliable* hints that
also appear on ordinary connectors.

## 3. What "procedural" has to mean here

**Rooms as modules with typed connectors.** A room is a box with N connector slots, all the same
clear width and height so any slot can meet any other slot. Per run, a seeded generator picks
rooms, places them, and joins slots. Each joined pair becomes one of:

| connector state | behaviour |
|---|---|
| open doorway | walk through (the routes the level gives you) |
| breachable | a normal panel — cheap, `STAGE_DEFS`, a traversal verb |
| chained | `damageable: false` — force alone never works |
| **exit** | `EXIT_DEFS` (560/760/580/3000), a 15–25 s siege, and a yard behind it |

**From the closed side, breachable / chained / exit must be indistinguishable.**

John's *"even if it doesn't make super logical sense"* is a real permission and it removes the
hardest constraint: the generator does not have to produce a plausible country house. It has to
produce a **legible, navigable, solvable** one.

## 4. What this breaks — all of it authored against a fixed plan

Honest list, because each is a real cost:

- **`PATROL_ROUTE` is hand-authored** — an ordered loop touching all six spaces, tuned so one lap
  is ~185 s. A generated map needs a generated patrol, and the *dwelling* is what makes it scary.
- **`SPAWN` and `ANCHORS` are hand-placed** (gadgets at named anchors, player spawn, hunter spawn).
  These become generator outputs with constraints: the player must not start next to the hunter,
  and gadget spread must stay meaningful.
- **D7 is 1.20 m ON PURPOSE** — a stage-3 hunter cannot fit, so the chapel is a refuge that growth
  takes away. **That is a mechanic expressed as a number in a table.** The generator must be able
  to *place* such a room deliberately, or the mechanic is lost.
- **`pathPortals()` already survives this** — it BFSs over whatever is open right now, which is why
  the AI routes through a hole you made the same way it routes through a door. **Built for exactly
  this. It is the one thing that needs no work.**
- **Residency and the draw-call ceiling do not.** ⚠️ The worst parked station already measures
  **616 / 625 draw calls**. A generator that lines rooms up into a long sightline will blow that
  instantly. **Residency limits must be a generation constraint, not a runtime hope.**

## 5. Solvability — the thing that must never be left to chance

A seeded generator can produce an unwinnable house. **Every generated map must be proven, at
generation time, to satisfy:**

1. **At least one exit is reachable** from spawn without passing through a chained connector.
2. **No player can be sealed in** — every room reachable from spawn has at least one non-chained
   way out.
3. **The hunter can reach the player** everywhere (or the horror stops).
4. **A minimum walk** from spawn to the nearest exit, so a run cannot be won in eight seconds.

`harness/scenarios/escape.mjs` already proves determinism across **512 seeds**. **Extend that: run
the generator over 512+ seeds and assert all four properties on every one.** A generator without
that gate ships unwinnable runs to real players and looks like a crash.

## 6. Order of work

> 📌 **STATUS, 2026-08-07 — ITEMS 1 AND 2 ARE BUILT.** This was checked on disk rather than assumed,
> because the campaign was about to be planned as though they were outstanding.
> - **Item 1 is built** — the connector interface exists and is covered by
>   `harness/scenarios/conn-1.mjs` and `conn-2.mjs`.
> - **Item 2 is built** — `src/game/exterior.js` implements `?tells=blind|marked|off`, **default
>   `blind`**, seeded per connector. The "live exit leaks daylight" tells this section flagged as a
>   contradiction were resolved into a toggle, and the indistinguishable reading is the shipping one.
> - **Item 4 is DEFERRED with the hunter** (John, 2026-08-07: *"the hunter will be key later"*).
>   Generated patrol, spawn and anchors wait for the hunter campaign. ⚠️ **But the hunter
>   REACHABILITY assert in §5.3 stays in the generator's gate** — it is a static graph property, it
>   costs nothing now, and without it this campaign ships maps the hunter campaign cannot use.
> - **Items 3 and 5 are the live work**, as slices `gen-1` and `residency-3` in Wave 4 of
>   `docs/design/dig-campaign.md`.
> - ⚠️ **The 616/625 ceiling quoted in item 5 is superseded**: after `instancing-1` the worst parked
>   station measures **580–586**, and panel cost no longer scales with panel count. `board-audit-2`
>   re-measures it at campaign start.

1. ✅ **BUILT.** **The connector interface** — one clear width, one height, one dressing, four
   states. Nothing procedural yet; retrofit the *existing* six-space plan onto it and prove the game
   still plays identically. **This is the step that de-risks everything after it.**
2. ✅ **BUILT** (`?tells=blind`, default). **Make the four states indistinguishable from the closed
   side** — and resolve what happens to the existing "live exit leaks daylight" tells, which this
   design contradicts.
3. **The generator**, seeded, with the §5 gate over 512+ seeds. → slice `gen-1`
4. ⏸️ **DEFERRED with the hunter.** **Generated patrol, spawn and anchors.**
5. **Residency limits as a generation constraint** (see the 616/625 ceiling). → slice `residency-3`
6. Only then: more rooms, and the estate rooms modularised — which is
   `docs/design/playable-estate.md`, and which needs instancing first.

## 7. What this does to the rest of the design

- **`escape.md` §6's "the answer changes every run; the skill does not" finally becomes true** —
  and the skill becomes *judging which door is worth 20 seconds*, which is a better skill than
  spotting a mortar patch.
- **The ball decoy gets its role**: you commit to a door, you cannot hear anything for 20 seconds,
  so someone has to be loud somewhere else.
- **Multiplayer gets a real economy** — with several players opening several doors, information
  about what is behind each one is the currency, and lying about it is free.
