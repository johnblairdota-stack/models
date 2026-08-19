# PRIME TIME — the gates

Written 2026-08-19 against `web-prototype/` at `9fca696`, 164 scenario gates.
**This file supersedes `rrr-social-deception-mode.md` §16** — V1–V23 was written before the
prototype was read. Same plan, rewritten as instruments this project already runs, cut from 23 rows
to **nine files**, three of which must exist before any party code ships.

---

## 1. The idiom, and why these fit it

Nothing here is a new practice. Every convention below is lifted from a file in `harness/`.

| the practice | where it already lives |
|---|---|
| **A gate is one `.mjs` whose header carries the argument**, because that is where a number survives its author's death, and its **assertions are letter-numbered, file-local and quotable** — `escape` 20/20, `dig-band` 14/1, `mechanics` 13/13 | `HANDOFF.md` L12–17 · `dig-band.mjs` L1–75 is 75 lines of argument before the first assertion · `escape.mjs` E1–E10 · `limb-collapse.mjs` C1–C5 · `aim-mark` A5 |
| **Three runners.** Browser gates under `harness/playtest.mjs --script`; rule gates as bare node against the shipped module; socket gates spawn the real server, connect real clients through a `t(name, cond, detail)` helper, print `N passed, M failed` and `process.exit(fail ? 1 : 0)` | `playtest.mjs` L30–41 · `_limb1-rule.mjs` L36–41 (real `DamageField`, no renderer, no wall clock) · `test-net.mjs` L5–13 · `test-net-gaps.mjs` L36–40 |
| **B0, the arm check: refuse a vacuous green.** The first assertion in a file proves the file has something to measure, and SKIPs with a reason if not | `dig-band.mjs` L129–146 |
| **A SKIP is never a PASS.** Twice damaged by an instrument that returned a confident wrong number rather than admitting it could not measure | `playtest.mjs` L43–49, L408 |
| **Every assertion ships a control that must fail, and the control runs every run.** Sixteen instruments on this project produced result-shaped output instead of an error | `_limb1-rule.mjs` L27–34 · `limb-collapse.mjs` L33–37 · `escape.mjs` L16–22 (`E4b`, `E7`) |
| **Some numbers are bands, not directions**, and **absolutes rot where properties do not** — `escape` E1's hard `4` passed for a year, then failed on a generated house | `dig-band.mjs` L15–18 ("the search IS the game") · `escape.mjs` L74–88 |
| **Hidden information is already server-side discipline, not a new idea** | `net/server.mjs` L18–19: *"StageHealth NOT replicated — never leaves this process… it would leak how close a wall is to opening."* |
| A finding is recorded as **one line of what changed, THE NUMBER, and THE INSTRUMENT** | `HANDOFF.md` L12–17. 30 KB budget: adding a row means cutting one |

**Two architecture constraints these gates impose, both load-bearing, and both the way `rules.js`
already works** — it imports nothing, so `net/server.mjs` and the browser load one copy of every
number. **(a) The PartyKit room logic must be a plain module importable in bare node**, transport
injected; without that, `party-sim` needs 1000 browsers and will never be run. **(b) The
entitlement matrix is DATA, not code** — one declarative table, one row per field path. The server
projects from it; the gate checks the observed wire against it. They may share the table and must
not share the projection, or a bug in the filter passes its own gate.

---

## 2. The gates

Nine files. Tier 0 ships before party code, tier 1 with the loop, tier 2 with roles and the Reunion.

| gate | file | proves | driven by |
|---|---|---|---|
| **0 · `party-isolation`** | `harness/party-isolation.mjs` | no socket ever receives what its player is not entitled to (§3) | real room, 9 real sockets, full transcript capture |
| **0 · `party-anon`** | `harness/party-anon.mjs` | no payload or caption ever names a culprit — T5 (§4) | sim transcripts + one browser arm on the TV |
| **0 · `role-deal`** | `harness/role-deal.mjs` | the cast table is exactly §8/C4 at every count, and the deal itself leaks nothing | bare node, 10k deals × 5 counts |
| **1 · `party-sim`** | `harness/party-sim.mjs` | the mechanical scaffolding is not already broken (§5) | bare node, 1000 seeds × 5 counts × 4 policies + a scatter control |
| **1 · `guide-lie`** | `harness/scenarios/guide-lie.mjs` | the runner/guide task satisfies T1–T4 and its honest error rate sits in band | `playtest.mjs --script`, real flyover, real `doorway-pick` |
| **1 · `phone-drop`** | `harness/phone-drop.mjs` | a phone that locks, reloads or backgrounds returns with its own private state and nothing else | real sockets, kill/restore in every phase |
| **2 · `vote-table`** | `harness/vote-table.mjs` | nomination and vote maths, exhaustively | bare node, state table |
| **2 · `reunion-truth`** | `harness/reunion-truth.mjs` | the Reunion reconciles with ground truth *and* nothing it shows leaked earlier | replay 500 `party-sim` logs |
| **2 · `director-cut`** | `harness/director-cut.mjs` | no key event happens fully off-screen unless flagged as a cutaway | replay 500 recorded rounds through the director |

**`role-deal` — R0–R5.** R0 arm: both alignments dealt. Exact composition per count — 1 evil @4–5,
2 @6–8 (`party-loop.md`; the bible's §8 "1 at 6" is **wrong**, and this gate settles it in code
rather than in two documents) (R1); uniform over seats, χ² over 10k deals (R2); one seed → one
deal, byte-identical twice (R3); the deal returns **per-player views** and a good view carries no
field naming another alignment — structural, so it holds before a socket exists (R4). R5 controls:
3 evil at 8 · always-seat-0 · full roster in every view; each turns exactly one red.

**`guide-lie` — G0–G6.** G0 arm: the pair spawned, the flyover opened, `channelOpen` went true
(`src/game/doorway-pick.js` L24–26 — do **not** retarget at `COLLAPSE.fail`). **T1** runner and
guide are never co-located and each payload holds ≥1 field the other's does not (G1); **T2** no
message type carries free text between the pair, ever — closed-schema, like §4's A1 (G2); **T3**
honest error rate on a degraded flyover read is **15–25%**, a band, not a direction (G3); **T4**
failure emits noise into `NoiseBus` and success emits some too, so silence is not a strategy, both
non-zero (G4); the flyover never reaches the TV (G5, also I8, asserted twice on purpose). G6 reports
median completion time and noise-on-success — the two numbers §5.2.3 requires of every new task.

**`phone-drop` — P0–P5.** Kill and restore every socket in every phase. The reconnect stream is a
subset of the entitlement (P1) and **is not a superset** (P2) — a welcome snapshot is the classic
leak, and `net/server.mjs` welcomes with a full one today. No soft-lock with a socket absent (P3);
a dead player reconnects to the audience, never a robot (P4); reconnect unfiltered turns P2 red (P5).

**Tier 2, briefly.** `vote-table` V1–V5 is exhaustive and not sampled — >50% threshold, one
nomination and one nomination-against per player, tie = no death, no ghost vote in v1 (D4/C1 split),
every path fires exactly once, an off-by-one threshold goes red. `reunion-truth` U1–U5 checks every
reveal against ground truth and hashes the append-only log at write, and its **U3 retro-leak sweep**
replays 500 games' pre-Reunion transcripts through `party-anon`'s scanner using the Reunion's own
reveal set as the token list — anything revealed that already crossed a wire gets named.
`director-cut` D1–D4 covers the mechanical half only: every `key_event` was on-screen or carries
`cutaway:true`, cutaways ≤ the authored budget, split-screen fires when both of the pair act in the
same second, and disabling the cut logic turns D1 red. **Whether a round is worth watching is not
automatable and is §6.**

### 2.1 What §16 dropped, and why

**V10 silent death, V12 info isolation and V22 Production Panel are one gate** (§3) — one property.
**V6 Breaker Sequence is deleted**: the runner/guide pair is the first task (audit §5.3), so
`guide-lie` inherits its error-rate band. **V7 Hunter attention is already built and better than
specced** — `rules.js` L259 `HUNTER_SENSE` is the model, so the bible's §6.1 should be deleted, not
gated. V1/V3/V17 are boot-and-doesn't-throw checks `audit.mjs --render` already performs for 37
views; they become `party-sim --live 100` in CI. V5, V13, V19 and V23 become arm assertions inside
`party-sim`; V9 and V14 fold into `guide-lie` and `phone-drop`. **V2 needs no new gate but does need
a measurement** — audit risk **A1**: the ≤625 draw-call budget is a *single-player* budget and eight
robots in a circle has never been measured. A `perf-*` run at M2, before art is committed.

## 3. `party-isolation` — the gate that matters most

**A phone that receives another player's role is a product-ending bug**, and it is the one bug
where a single missed field on a single frame in a single phase ends the game — silently, in
someone's lounge, with no error thrown. Every other gate here can be added late. This one cannot.

`net/server.mjs` L18–19 already refuses to replicate `StageHealth` *because it would leak how close
a wall is to opening*. That is this discipline, already written down, already applied to a much
smaller secret. This gate extends it and makes it mechanical.

**Shape.** Bare node, in the manner of `test-net.mjs` L5–13: spawn the real room (`partykit dev`, or
the room module over a loopback transport), connect **nine real sockets** — 8 phones + 1 TV — and
play a scripted full game per seed. **Every socket's complete raw frame stream is captured
unfiltered** to `progress/party-isolation/<seed>/<socket>.jsonl`, and every assertion below runs
against those transcripts, never against the server's intent.

**The entitlement matrix** is one declarative table, `net/party/entitle.js`, and it is
**deny-by-default**: a field path with no row is a violation, not a pass. Rows are
`[pathGlob, audience]` where audience ∈ `{self, evil, crew, guide, runner, tv, all}`.

```
'you.role'          -> self     'players[].alive'     -> all
'you.teammates[]'   -> evil     'players[].alignment' -> (no row)  // nobody, ever, pre-REUNION
'flyover.*'         -> guide    'incident.count'      -> all
                                'incident.by'         -> (no row)  // T5
```

**Assertions.**

- **I0 — the arm.** All 9 sockets connected, roles dealt, ≥1 evil, every phase entered, ≥N frames
  per socket. Anything short → **SKIP with the reason**, never a pass: a room that never dealt a
  role trivially leaks no role. (`dig-band` B0.)
- **I1 — closed schema.** Every key path on every frame on every socket has a matrix row.
  **An unknown key is a FAIL**, naming socket, frame index, and JSON pointer. This is the clause
  that stops the gate rotting: a feature added six months from now that puts a new field on the
  wire fails here until someone writes its row and states its audience out loud.
- **I2 — the matrix holds.** No key path reaches a socket its row does not entitle.
- **I3 — the semantic sweep.** Take the seed's ground truth — every alignment and role name, the
  evil roster, the flyover contents, the hunter's path, the seeded task answer — and recursively
  scan every non-entitled transcript for those *values*, at any depth, inside caption strings and
  enum codes included. I2 catches a wrong key; I3 catches the right key carrying a wrong value.
- **I4 — shape parity.** After substituting each socket's own id and display name, **the
  transcripts of all equally-entitled sockets must be byte-identical.** Six good non-crew phones
  are epistemically identical by design (§5.4) and must therefore be identical on the wire. This
  is the assertion that catches the leaks nobody writes deliberately: an array sorted by
  alignment, an evil-only array whose *length* is visible, a nullable field present on one phone
  and absent on another.
- **I5 — cardinality and timing parity.** Identical frame counts, and identical per-phase counts,
  across equally-entitled sockets. A phone that gets one extra frame in CASTING was told something.
- **I6 — the one exception is exactly one exception.** Only evil sockets receive `you.teammates[]`
  and unpublished claims, at any phase (V22), and the evil set on the wire equals the ground-truth
  evil set — not a superset, not a subset.
- **I7 — death reveals nothing.** After a take, no socket's later frames contain the dead player's
  alignment, and a survivor's frames are unchanged in shape from before the take (V10 + I4).
- **I8 — the guide's map is for one phone.** `flyover.*` reaches exactly one socket per
  expedition, and never the TV. `party-loop.md` puts this under *Do not* in its own words.
- **I9 — THE CONTROLS, and they run on every run.** Four leaks are injected one at a time via
  `LEAK=<n>`: (1) broadcast `you.role` to all; (2) send the evil roster as a length-2 array to
  everyone; (3) sort `players[]` by alignment; (4) put `flyover` on the TV. Each must turn
  **exactly one** named assertion red. **If any control passes, the gate reports itself blind and
  exits non-zero**, because a filter that blocks everything and a filter that blocks nothing look
  identical to a check that only ever runs the shipped arm (`_limb1-rule.mjs` L27–34).

**How it fails:** loudly and specifically — `FAIL I2 · phone-3 · frame 412 · players[1].alignment
= "evil" · matrix has no row`, plus the path to the transcript. **Runs in CI on every commit**,
over the seed set, and it is the only gate here for which a red result blocks a merge outright.

---

## 4. `party-anon` — T5 conformance

T5 is *"never name the culprit — no timings, no accuracy readouts, no per-player stats, until the
Reunion"*, and the bible calls it the single easiest way to accidentally destroy the game. It is
also the easiest thing to add by accident, because "someone was 0.4s late" is a *helpful* debug
line and it ships in a caption.

The trick that makes this gate cheap is the same one as I1: **the failure-event schema is closed.**
One allow-list of fields — `{kind, room, phaseTick, loudness}` — and anything else on a
failure-class payload is a FAIL. Prohibiting attribution field-by-field is unwinnable; permitting
four fields is a five-line check.

- **A0 — the arm.** At least one failure event of each kind in the deck; none → SKIP with the
  reason. A game where nothing went wrong proves nothing about T5.
- **A1 — closed schema.** No field outside the allow-list on any failure-class payload.
- **A2 — no identity, at any depth.** Sweep every failure payload for any player id, display name,
  seat index or nameplate from the ground-truth roster, case-folded, substring, recursive.
- **A3 — no per-player cardinality.** A failure payload carries no array whose length equals the
  crew size and no map keyed by player id. This is what catches `timings: [0.4, 0.0]`, which names
  the culprit by *position* without ever containing a name.
- **A4 — the incident count is a count.** `{alarms: 3}`, never `{alarms: [...]}`. §5.6's "3 alarms
  this episode, with no attribution" is the deduction fuel, and it stops being fuel the moment it
  is a list.
- **A5 — the TV caption sweep.** Browser arm under `playtest.mjs --script`, holding a window of DOM
  text the way `limb-collapse.mjs` L70 (`watchHud`) does — a caption is a *moment*, and a single
  sample catches one lower-third and calls the other missing. No caption string over N games may
  contain a roster name or id. `[LOUD CRASH — EAST WING]` passes; `[PANEL ALARM — ALEX]` does not.
- **A6 — the Reunion is the exception, and the scanner can see it.** Re-run A2/A3 over
  `phase === REUNION` frames with the exemption removed; **it must FAIL**. A scanner that never
  finds attribution anywhere is a scanner that cannot find attribution.
- **A7 — controls.** Inject a named caption, a `timings[]` array, and a per-player accuracy stat.
  Each must turn exactly one of A1/A2/A3/A5 red.

**Runs in CI on every commit**, alongside `party-isolation`.

---

## 5. `party-sim` — the balance simulator

Build it at **M3, not M7**. Bare node against the shipped room module, no renderer and no wall
clock — the construction of `_limb1-rule.mjs` L36–41, which drives the real `DamageField` headless
and gets bit-identical answers under any load.

**What it plays.** Complete games — `CASTING → EXPEDITION → DEBRIEF → NOMINATION → VOTE → VERDICT`
— at 4–8 players × 1000 seeds, the Expedition being the runner/guide pair with the automated hammer
resolved against the real `HUNTER_SENSE` and `NoiseBus`, not a stub.

**Bot policies.** `naive-good`, `cautious-good`, `patient-evil`, `aggressive-evil`, and `scatter` —
a policy that plays at random. **`scatter` is not decoration:** if the tuned policies do not produce
a materially different good win rate from it, the sim is not measuring play and every band below is
noise. (`debris-collapse` C5's two-policy discipline, copied verbatim across `_sag1-grain` and
`_limb1-rule` so three files measure the same player.)

**What it reports, and the bands.** Every one of these is a **band, not a direction**.

| | measure | band | out of band means |
|---|---|---|---|
| S1 | good win rate, per player count | **45–55%** | the cast table or the win condition, not the bots |
| S2 | executions that hit an evil player | **40–60%** | <35% good is guessing · >70% evil is transparent |
| S3 | hunter arrivals with **no evil cause** | **40–50%** | the attribution number. Below it, every arrival is a confession and the game is over |
| S4 | guide honest error rate, per call | **15–25%** | T3. Below it, every failure is a confession |
| S5 | off-crew evil influence | **≥1 event/round** mean | C2 makes 6 of 8 spectators; this is the D1 counterweight and if it reads 0 the levers are dead weight |
| S6 | rounds to conclusion, median | report only | no band until playtest sets one |

**S0, the arm.** Both alignments won at least once; every phase entered; the seed set produced
distinct games rather than one game 1000 times; one seed replays byte-identically twice.
**What it does not prove:** bots cannot model the social layer. It validates that the mechanical
scaffolding is not already broken before humans see it, and says nothing about whether the game is
fun, the lie readable, or the broadcast watchable. Those are §6.

---

## 6. Playtest instrumentation

Reaches what no gate above can. Findings enter `HANDOFF.md` in its own idiom: **one line of what
changed, THE NUMBER, THE INSTRUMENT.**

| watch | the number | why |
|---|---|---|
| **Dead air** — fraction of Expedition 5s bins with zero spectator reaction-bar events | **RESOLVED as D15.** Primary watchability metric, automatic, no observer. **Target under 40%, alarm above 60%.** A rapt silent room reads as a false positive, which is what the glance count is for |
| **Glance count** — spectators with eyes on their own phone for ≥3 consecutive seconds, sampled t=20/50/80s | **D15.** Warning at ⅓ of spectators, failure at ½, sustained across 2 of 3 samples. 7–8 players only. Episode 3 onward. **Turning to argue with a neighbour is engagement, not defection — only the phone counts** |
| **Post-round one-tap survey** — *"Do you know who caused that?"* Yes / No / Guessing | accuracy **50–65%**. 95% means the game names the culprit; 20% means it is a coin flip. The most direct measurement of R1 that exists |
| **Speaking-time distribution** across the 150s Debrief | loudest player **<35%**. Above it, quiet players have nothing to say and the design owes them evidence |
| **Guide honest error rate**, live | the same **15–25%** band as `party-sim` S4. If the live number is materially under the sim's, the flyover is too legible and the lie has no cover |
| **Wall clock per phase** · **the Reunion reveal**, counted as audible reactions | total session **25–40 min**; zero reactions at the Reunion is a design failure and the only test of D5 there is |
| **Off-crew evil**, post-game — *"did you have anything to do while you weren't the pair?"* | R2b, and under C2 it is worse than the bible assumed |
| **Draw calls in the seated circle** (audit **A1**) | budget is **≤625 and it is a single-player budget**; one gadget prop costs 39–205. Eight customised robots plus a TV camera has **never been measured**. Measure at M2, before art is committed |

Two of these are judgements, not counts, and they belong to the existing critic skills rather than
to a new instrument: watchability of a round you are not in → `rrr-playcritique`; whether the
seated circle reads → `rrr-critique`. A builder must never grade its own fix (`rrr-slice`).

---

## 7. Build these three first

Before any party code ships — and specifically **before the wire format is settled**, because all
three are cheap as constraints and expensive as migrations.

1. **`party-isolation` (§3).** The product-ending bug, invisible without a transcript gate. Writing
   it forces the two architectural decisions everything else depends on: the room module importable
   in bare node, and the entitlement matrix as data with a stated audience per field.
   Deny-by-default is only free while the payload set is empty.
2. **`party-anon` (§4).** Closing the failure-event schema costs five lines today and is a migration
   across twenty payload types later. T5 is unguarded in the tree right now (audit §3), and the
   first debug caption reading *"ALEX was 0.4s late"* ships without anyone noticing it was a design
   decision.
3. **`role-deal` (§2).** Ten minutes, bare node, no transport. Settles C4 in code rather than in two
   documents that disagree, and proves the deal returns per-player views before there is a socket
   to leak them down.

`party-sim` is a close fourth — it is what makes every balance argument after M3 a measurement
instead of an opinion — but it needs a loop to play, and these three do not.
