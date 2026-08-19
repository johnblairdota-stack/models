# Slice: HANDOFF.md is 365 KB and every agent reads it first

**Files you may edit — nothing else:**
- `HANDOFF.md`
- `docs/handoff/*.md` (new directory, you create it)
- `docs/archive/*.md` (new files only — do not edit the existing archive)

**Files other agents own this wave — do not touch:** `docs/PLAN.md` and `progress/**` belong to
`board-audit-2`; `refs/**` belongs to `refs-dig-2`.

**Touch no file under `src/` or `harness/`. This slice moves prose. If you find yourself editing
code, you have misread the slice.**

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. Why this matters

`HANDOFF.md` is **365,089 bytes — roughly 90,000 tokens.** Every agent this project spawns is told
to read it first, and the campaign about to start (`docs/design/dig-campaign.md`) will spawn
somewhere between twelve and twenty. **This one file is the single largest recurring cost in the
campaign**, and it blocks Wave 2 for exactly that reason.

It was pruned once, on 2026-08-03 (`docs/archive/handoff-pre-prune-2026-08-03.md`). It has grown
back. Pruning it again by hand and hoping is not the fix — **the fix is a structure that cannot
regrow**, because new rounds write to an appendix instead of to the front of the file.

## 2. What is actually in there — measured, so you do not have to explore

32 top-level `##` sections, 4,696 lines. **Three sections are 54% of the file:**

| bytes | line | section |
|---|---|---|
| 111,758 | 3206 | `## Queue (rewritten 2026-08-04 evening…)` — **not a queue.** ~35 `###` round write-ups accreted under it: `estate-owner-9/10/11/12/13`, `critic-estate-5..11`, `gadget-owner-7`, `critic-gadget-4/5/6`, `fx-glow`, `perf-ao`, `play-critic-7/8`. |
| 46,734 | 1614 | `## 🎮 FOUR BUGS FROM JOHN'S OWN PLAYTHROUGH` |
| 35,848 | 1105 | `## Instrument hazards (all bit someone this week)` |
| 14,886 | 2251 | `## HUNTER — round 2 of critic-hunter-2's list` |
| 12,581 | 938 | `## Landed today (verified, keep)` |
| 12,489 | 142 | `## 🕳️ THE INTERCONNECT EXISTS (dig-2)` |
| 12,349 | 311 | `## ⛏️ DIGGING IS BUILT BEHIND ?dig=1 (dig-1)` |
| 12,226 | 598 | `## 🔒 THE EXIT IS A SIEGE NOW (escape-owner-2)` |
| 10,284 | 2788 | `## game.play PERF — FIXED 2026-08-04` |
| 8,934 | 480 | `## 🧱 THE DRAW-CALL GATE IS OPEN (instancing-1)` |

The rest are 8 KB and under.

## 3. What to do

### 3a. The core — target **≤ 20,480 bytes**, hard gate

`HANDOFF.md` keeps only what **every** agent needs regardless of what it was spawned to do:

**Keep, close to verbatim** (these are small and load-bearing):
- `## The rules (proven again today)` (1,110 B)
- `## Direction from John (2026-08-03, overrides the sheet where they conflict)` (639 B)
- `## ⚠️ A FLAW IN HOW BLIND A/Bs WERE BEING RUN — fix this in every future brief` (2,068 B)
- `## 🔎 THE DOMINANT DEFECT CLASS: "IT EXISTS, SOMETHING IS IN FRONT OF IT"` (2,790 B)
- `## ⚠️ A capture-integrity bug that could have corrupted any verdict` (905 B)
- `## 🔧 harness/mechanics.mjs — the tool the other four could not be` (1,640 B)
- `## Mansion: what is measured, and the two things still open` (1,587 B)

**Rewrite, do not copy:**
- **A new opening "Where it stands" block, ~2 KB, dated 2026-08-07.** The current one is dated
  2026-08-03 and is wrong. State: the board line, the tree state, that the game is playable and
  winnable, that dig is built behind `?dig=1` default off, and that the current campaign is
  `docs/design/dig-campaign.md`. ⚠️ **Do not invent board numbers** — `board-audit-2` is measuring
  them in parallel this wave. Write the block with a `<!-- board: pending board-audit-2 -->` marker
  and say so in your report; the orchestrator fills it in.
- **`## Instrument hazards` condensed to ~3 KB.** Keep the *class* of each hazard as a one-or-two
  line rule (the `fbmT` bell around 0.5; GLSL reserved words failing silently; backticks inside GLSL
  template literals; scripted string replacement half-applying; cached overlays being staler than
  the render they describe; instruments that report success on something rendering under a splash).
  **The case studies — which agent, which round, how long it cost — move to the appendix.** The rule
  is what prevents the next failure; the story is what makes it 36 KB.

**Add, new, ~1.5 KB:** a **pointer table** — one line per appendix saying what is in it and when to
read it. This is the part that makes the diet stick.

### 3b. The appendices — `docs/handoff/`

Split by the domain an agent is spawned into, because that is how the reading decision is actually
made:

| file | takes |
|---|---|
| `docs/handoff/dig.md` | the two dig sections (L142, L311) |
| `docs/handoff/escape.md` | the siege (L598), the outside (L777), win-condition decided (L2959) + built (L3026) |
| `docs/handoff/walls-perf.md` | instancing (L480), `game.play` PERF (L2788), and the `perf-ao` / draw-call `###` blocks from Queue |
| `docs/handoff/hunter.md` | the stale-scores warning (L2215) + `hunter-owner-2` round 2 (L2251) |
| `docs/handoff/game-feel.md` | John's four playthrough bugs (L1614), fairness (L2611), fleeing (L2677), the `play-critic-7/8` blocks from Queue |
| `docs/handoff/estate.md` | the `estate-owner-*` and `critic-estate-*` blocks from Queue |
| `docs/handoff/gadgets.md` | the `gadget-owner-*` / `critic-gadget-*` blocks from Queue, plus attachments (L1545) |
| `docs/handoff/instruments.md` | the instrument-hazard case studies stripped out of §3a |
| `docs/handoff/robot-char.md` | grime/gravity (L55), `char.locomotion` r4 (L2488), the robot r36 blocks |

Each appendix opens with **two lines**: what it covers, and *when* an agent should read it.

### 3c. The archive

Anything that is neither a current fact nor a reusable lesson — superseded scores, overturned
claims kept for the trail, round-by-round narrative — goes to
**`docs/archive/handoff-pre-prune-2026-08-07.md`**, one file, with a header explaining what it is
and that it is history rather than fact.

⚠️ **Move, never delete.** There is no git in this project. Nothing recovers.

## 4. The bar

**The test:** a new agent spawned into any one domain reads the core plus one appendix and knows
everything it needs. It should not need a second appendix, and it should never need the archive.

**The second test:** every claim that is currently in `HANDOFF.md` is still findable in one hop from
the core's pointer table. Nothing is orphaned.

## 5. Presentation

- The core's first screen must answer *"what is true right now"* — board, tree, campaign, rules.
  Not history, not a round write-up.
- Keep the file's existing voice. The bold-claim-then-correction style is *why* this document has
  worked; do not neutralise it into minutes.
- **Preserve every ⚠️ and 🚨 marker on the content it belongs to.** They mark landmines, and
  several of them cost this project days.

## 6. Traps

- ⚠️ **The `## Queue` section is not a queue.** Its name will tempt you to keep it in the core as
  "the current plan". It is 111 KB of history. The actual current ordering is
  `docs/design/dig-campaign.md`. Archive the narrative, keep nothing but a pointer.
- ⚠️ **`docs/PLAN.md` is stale and is NOT yours.** `board-audit-2` owns it. If you notice it
  disagrees with the board, put that in your report.
- ⚠️ **Do not summarise a measurement into a vaguer measurement.** "The worst station was over
  budget" destroys the value of "625–627 against a 625 ceiling, twelve stations, seed s4, two runs
  per arm." Numbers move verbatim or they do not move.
- ⚠️ **A section that reads as settled fact may be superseded elsewhere in the same file.** L2215
  is literally titled "THE SCORES BELOW ARE STALE". When two blocks disagree, **the later one wins,
  and you say so in the appendix header** rather than silently dropping one.

## 7. Verify

```bash
wc -c HANDOFF.md
```
Must be **≤ 20480**. Then:

```bash
ls -la docs/handoff/
grep -c "docs/handoff/" HANDOFF.md
npm run build
```

**What to look at:** open the new `HANDOFF.md` end to end and read it as if you had just been
spawned. If any sentence assumes a fact that now lives in an appendix without pointing at it, that
sentence is broken. Then open two appendices at random and check each one opens with its
what/when lines.

⚠️ **`npm run build` — never `npx vite build`.** The npm script lints GLSL literals first; skipping
it took the build down four times in two days. You are not editing GLSL, but the gate proves you did
not touch anything you should not have.

## 8. Regression gate

This slice has no code dependants, but it has **process** dependants: every future brief cites this
file. Before you finish, confirm that these still resolve to real content, in the core or one hop
away:

- the `npm run build` rule
- the builder-ceiling-is-PASS rule and critic-only-WOWED
- the "one GPU measurer at a time" rule
- the `fbmT` bell hazard
- the blind-A/B procedure

If any of the five is now unreachable, the diet cut too deep.

## 9. Report back

The before and after byte counts; the appendix list with each one's size; **what you archived that
you were least sure about**; and anything in the file that contradicted something else in the file
(you will find some — that is the most valuable thing you can report).

**Do not touch the board.** This slice sets no verdict. If you want to leave a trace:

```bash
node harness/status.mjs note "handoff-diet-1: HANDOFF 365KB -> NNKB core + N appendices + archive"
```
