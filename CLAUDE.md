# CLAUDE.md — read this before HANDOFF.md

**There are two games in this repo. Know which one you are working on before you read anything else.**

| | Survival mode ("Run Robot Run") | **PRIME TIME** (social deception) |
|---|---|---|
| What | Small robots dig a destructible mansion; a corrupted hunter absorbs their parts | Reality-TV night loop: 8 robots, phones as controllers, TV as the show |
| Lives in | `src/game/`, `src/destruction/`, `src/world/`, `src/characters/` | `src/party/`, `net/party/`, `src/views/party-host.js`, `src/views/party-phone.js` |
| Its context doc | `web-prototype/HANDOFF.md` | **this file + `docs/design/rrr-social-deception-mode.md`** |
| Phase machine | `src/game/run.js` — `EXPLORE/WINDDOWN/DETONATION/RESULTS` | `src/party/phases.js` (design) + `src/party/show.js` (wire), kept in step by `episode-order` |

> ⚠️ **`HANDOFF.md` is the survival game's doc and says "read this first, then stop reading."
> That instruction is now wrong for Prime Time work.** It was last substantively updated
> 2026-08-19 and contains **zero** mentions of Prime Time, Casting, Debrief, Reckoning, Recap,
> Reunion, Expedition or ballots — every PR from #29 onward. Read it for the dig, the art bar,
> the GLSL lint rule and the build discipline. Do not read it for the night loop.

## Build and run

```bash
cd web-prototype
npm install
npm run build && node harness/serve.mjs     # -> localhost:5192/?view=game.play
npm run party:local                          # party server
npm run gates:party                          # the 24-gate suite CI runs
```

⚠️ **`npm run build`, never `npx vite build`** — the former runs `harness/lint-glsl.mjs` first, and
a backtick inside a `/* glsl */` template literal takes the whole build down. Editing a file with
`/* glsl */` in it? Run `node harness/lint-glsl.mjs` after **each** edit. (Argument in `HANDOFF.md`.)

## The night loop — designed vs wired

Designed order (`src/party/phases.js:45`, `EPISODE_ORDER`):

```
Casting → Expedition → Recap → Debrief → Reckoning → Vote → Execution → Verdict
   ↑                                                                       │
   └───────────────────────────────────────────────────────────────────────┘
every episode runs this in full · session is designed to end in a Reunion special
```

**Every episode runs the same order, premiere included.** `orderFor` used to stop episode 1
after Debrief while the live wire never did; the two disagreed, both halves were gated as
correct, and John kept the vote. `harness/episode-order.mjs` now asserts the two machines AGREE
rather than asserting an order — it derives the expected live walk from `orderFor`, so it follows
any future change and fails only when they drift apart again. **If you change the running order,
change it in `phases.js` and let that gate tell you what moves.**

**One designed beat is still off the wire: `VERDICT`.** `SHOW_BEATS` has eight beats and no
`verdict` and no `reunion`; `AFTER_RUN_NEXT.execution = 'casting'` walks Execution straight back
to Casting, while the TV rundown rail shows Verdict as a label that never lights. This is staged,
not broken — `episode-order`'s `WIRE_MISSING` names it, and the day Verdict grows a wire beat,
delete it from that list.

**Before you "fix" anything else here, read the gap list in `docs/design/PRIME-TIME-STATE.md`.**

## Locked product rules — do not relitigate these without John

These were decided in playtest and cost real sessions to arrive at. Changing one is a design
decision, not a refactor.

- **D13 · The phone is a controller, never a viewport.** No 3D on the phone. The runner's camera
  lives on the **TV**. A phone chase embed was built (#29) and **removed** (#30) because it loaded
  slowly and did not work. The pad has **two shapes**, and which one is live follows the camera:
  on the ground it is two sticks (left = move, camera-relative; right = look/orbit); under the
  plan-locked top-down the look stick is **not rendered** and the move stick is **absolute** —
  screen direction is world direction — with RUN/SWING grown into the freed half. The phone is
  told which via `you.view` (runner-audience). Gates: `party-warm` W26i–W26i4.
- **The DIRECTOR may not cut during the run** — no shoulder / lead / doorway under the player's
  thumb, because those invert a camera-relative stick. ⚠️ This bullet used to read *"chase-only
  during the run"* and that became literally false when the four perspectives shipped; a
  perspective is **held**, chosen by the game, and is not a cut. Gate: `party-warm` W26h/W26h2.
- **The expedition chooses its own camera at the ballroom threshold.** Inside the ballroom the
  show is on `chase`; outside it the show is `top`, and the change between them is a 1.35 s
  **crane** (1.10 s coming back), not a cut. Hysteresis is a 2.20 m dead band at the wall so a
  doorway cannot strobe it. The `?dev=1` **P** key still cycles all four rigs for inspecting
  ceiling art, and the next crossing takes the camera back. Gates: `party-follow` F11i–F11i5,
  `party-warm` W26h3.
- **The TV may see over the walls of the runner's OWN rooms, and never the whole house.**
  `party-loop.md`'s "Do not" #1 is narrowed, not repealed — no whole-house fit, no hunter mark,
  no route line, no plan diagram. `setLid(on, ids)` is scoped to residency's set. Ratified by
  John after `CRITIC-LEDGER` round 8 raised it. Gates: `party-follow` F11c2d,
  `party-follow-drive` D5.
- **Casting has no "Send them in" button.** Once runner and guide lock, the TV counts 3·2·1.
- **Every episode runs the full order, premiere included** — episode 1 votes and evicts like any
  other. Decided 2026-08-25; `phases.js` `orderFor` carries the argument, the 105s it costs the
  night, and the line to change back if a real premiere feels arbitrary. Gate: `episode-order`.
- **Casting has a server-side backstop** (`CASTING_BACKSTOP_MS`, 45s) so a dead TV tab cannot hang
  the room, but an **empty ballot box still waits** — the net re-arms and never invents a pair.
  Gate: `party-night` N20a–e.
- **The 3·2·1 arms on all ballots in, or a ~20s backstop** — never on the first ballot
  (`CAST_BACKSTOP_MS`, gate `cast-ballot.mjs` B12b–B12e). Regressing this crushes big tables.
- **Empty ballots at capacity wait; they never invent a runner/guide pair** (gate
  `party-night.mjs:366`). Found live at N=8.
- **No self-vote on the lynch ballot** — server coerces a self-pick to NO ONE (gate
  `vote-table.mjs:108`).
- **Nominating is voting.** A nominator's vote is assumed for their nominee; they do not vote again.
- **Casting ties break on a seed, silently** — no human re-vote. The reason shows on the TV board.
- **Duplicate names and colours are allowed.** There is deliberately no anti-dupe system.
- **Recap is ~10s and must not scroll.** Talk chrome sits in top/side/bottom bands so the ballroom
  chairs never cover nomination / execution / verdict plates.
- **Ballroom camera is outside the chair circle**, sweeping, cameraman-walk transitions that keep
  the group centred. Not tight face-front intros.
- **Chairs are solid and persistent** — robots path around them, and the seated circle stays on
  air during the run.
- **Name tags float above the head, billboard to the TV camera, black-outlined white text**, and
  must stay legible at low quality and distance. Red `!` over a nominee, above the tag.
- **Sledge grip is bench-locked**: `GRIP_SHIPPED` 2.37 rad, haft 0.205, guards 13.3 cm off wrist /
  31.0 cm up shaft / 89.8°. Bench is `?view=char.grip` / `harness/_grip_shot.mjs`. The product
  hammer must match the bench — this was got wrong twice.
- **TV visual direction is B — "Rundown Rail"**: the night's schedule across the top, shrinking to
  a 22px ribbon during the Expedition.

## Gates are the memory

Every bug above that has a gate name beside it is locked in. `.github/workflows/gates.yml:44` runs
the full `gates:party` chain on every push and PR. **A playtest finding is not finished until it is
a gate** — five agents' findings were lost in August because they lived in transcripts.

Known unguarded: **smash-target visibility.** Nothing asserts a mission target is visible or
reachable, so "the painting was behind the furniture" can silently come back. This is the last
live-found bug class with no regression net.

## Working style

- Land work on a branch, let `gates:party` go green, then merge. Never push to `main` directly.
- File ownership is exclusive when agents run in parallel (`ORCHESTRATION.md`) — note that file's
  own status line is stale, but the ownership table still governs.
- Findings go into **the instrument that proves them** (the gate's header) plus one line here.
  Not into a transcript.
