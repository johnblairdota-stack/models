# PRIME TIME — state of the night loop

Audited against `main` @ `5752c22` (PR #49), 2026-08-25. **Updated after two fixes landed** —
see §3 and §2, and the two patches that go with this document.
**Updated again 2026-08-28** — two forks of the same main tip landed together: the casting
screen (full-bleed overlay, 3·2·1 re-arm, nomination receipts, accusation UI) and the night's
ending (Verdict on the wire, Reunion with a caller, SKIP TO REUNION). §5 has a new top row; §2's
two worst rows are closed. The sentence this document was best known for — *"Nothing ever ends a
session"* — is no longer true. The chain is 28 gates in CI, plus `perspective-shots` as a named
drive, and 1273+ assertions.

> ✅ **§2's two worst rows are closed.** Verdict is on the wire and the Reunion has a caller, a
> beat, and two screens. `harness/win-machine.mjs` W10 plus `harness/party-night.mjs` N17n now
> assert it in both machines. The rows below are rewritten in place; the old text is quoted
> where the argument still matters.
Method: read the phase machines, the wire, and every gate in `gates:party`. Nothing inferred from
filenames or from chat transcripts.

## 1. Three phase machines, not one

`rrr-social-deception-mode.md` §15 says: *"`src/game/run.js` already has authority-gated mutators
and `syncPhase`/`applySnapshot`. Add entries to its `PHASE`; do not write a second machine."*

That was **deliberately not followed**, and `src/party/phases.js:8-12` documents why — the bomb
timer (D12) must stay structurally unreachable from the party mode. That reasoning is sound. But
the result is three live definitions plus one dead one:

| # | Where | Contents | Role |
|---|---|---|---|
| 1 | `src/game/run.js:52` | EXPLORE, WINDDOWN, DETONATION, RESULTS | Survival mode. Untouched, correctly. |
| 2 | `src/party/phases.js:17` | PREMIERE, CASTING, EXPEDITION, RECAP, DEBRIEF, RECKONING, VOTE, EXECUTION, VERDICT, REUNION | **Design intent.** Data only — durations, `EPISODE_ORDER`, `orderFor`. No transitions. |
| 3 | `src/party/show.js:16` | lobby, casting, expedition, recap, debrief, reckoning, vote, execution, **verdict**, **reunion** | **The wire.** What actually runs. Driven by `net/party/local.mjs` `progressShow`. |
| 4 | `src/party/room.js:34` | LOBBY, CASTING, EXPEDITION, DEBRIEF, VERDICT | **Dead.** Imported nowhere. `setPhase` (room.js:299) validates nothing. Delete it. |

~~**#2 and #3 disagree, and #3 wins at runtime.**~~ **They agree, as of 2026-08-28.**
`harness/episode-order.mjs` `WIRE_MISSING` is empty and E2 compares the two with no exclusion list
between them — the day that gate was written its header carried a standing instruction to delete
`VERDICT` from that list, and it has been carried out. #4 is still dead and still wants deleting.

⚠️ **They also disagreed about how many episodes a SEASON lasts, which is one layer above what E2
compares.** `foldVerdict` measured `EPISODE_CAP` against `state.episode`, and `playEpisode` bumps
that *before* the live Verdict beat is reached but *after* the offline one — so a real room
stopped after four of five episodes while the offline machine stopped after five, and both had a
green gate. Fixed by measuring `state.airingEpisode`, the episode ON THE AIR, which both paths set
at the top of the episode. Gates: `episode-order` E6/E6b, `party-night` N17n.

## 2. Beat by beat

| Beat | State | What advances it | Risk |
|---|---|---|---|
| Casting | live | TV counts 3·2·1 after all living ballots or ~20s (`party-host.js:536`), sends `t:'episode'`; **server backstop at 45s** (`CASTING_BACKSTOP_MS`) | ✅ **Fixed.** Was client-driven with no server timer — a dead TV tab hung the room forever. The net is armed in `setShow` so every path into casting is covered, fires well past the TV's 20s so it never races it, and shows nothing to the viewer. An empty ballot box still waits: it re-arms rather than inventing a pair. Gate: `party-night` N20a–e. |
| Expedition | live | TV world report `mission.phase==='done'` (`show.js:171`); 8-min backstop | ok |
| Recap | live | 10s timer (`holdMsFor`, `show.js:134`) | ok |
| Debrief | live | 75s timer; a late nominate short-circuits into Reckoning (`local.mjs:272`) | ok |
| Reckoning | live | 45s + 15s/nom, cap 90 (`phases.js:61`); empty re-arms 3× then walks | ok |
| Vote | live | 25s or `result.closed` (`local.mjs:295`) | ok |
| Execution | live | 20s | ok |
| **Verdict** | **live** | 15s (`VERDICT_HOLD_MS` from `SECONDS[PHASE.VERDICT]`) | ✅ **Fixed 2026-08-28.** `AFTER_RUN_NEXT` is `execution → verdict → casting`; `enterVerdictLive` airs status / cameras / episode. The rail chip lit with no change to `rundownRailHtml` — `live` was already `SHOW_BEATS.includes(id)`. The fold was **extracted** out of `playEpisode` rather than copied, so both machines fold one win. `foldWin` returns `fed` and it does not reach the plate: gate `party-night` N17h0b. |
| **Reunion** | **live** | session end — nothing follows it | ✅ **Fixed 2026-08-28.** `progressShow`'s walk back to Casting is now conditional on the fold: RENEWED plays on, anything else enters the Reunion. **This is the first conditional edge in the whole wire.** `reunion.js` has a caller (`room.reunionSpecial()`), a fanout (`t:'reveal'`), a TV screen that turns the plates one at a time, and a phone sheet that puts your own card face-up. Gates: N17h/N17h2 (the terminal edge), N17j (the other side), N17m–N17m3 (the reveal, including that nothing named anyone else's side before it). |
| Premiere | unused | — | Referenced only in budget math (`phases.js:32`) |

## 3. The premiere — RESOLVED, the other way round

**The audit called this a bug. That was overconfident, and the code said so.** `party-night`
N17c and N17d sat side by side: *"playEpisode still skipped Reckoning on episode 1"* and *"live
clock walks Debrief → Reckoning on every episode, including ep1."* Whoever wrote them knew about
the split and gated both halves as correct. `orderFor` skipped; the wire never did.

So it was never "the live path forgot" — it was two machines, each with its own gate, disagreeing
about the premiere for as long as both existed. A table got whichever half happened to drive it.

**John's call: keep the vote.** *"I don't know why we would skip it."* The live behaviour was
already the shipped one, and a premiere that teaches the loop without ever showing the vote
teaches half of it. `orderFor` lost its episode branch; `playEpisode` lost the skip.

The old argument — nobody has anything to go on in the premiere, an eviction decided on nothing
teaches a table the vote is arbitrary — is **overruled, not refuted**. It is a table-feel
question, answered by playtesting a premiere rather than by reading a file, and it is kept on the
record in `phases.js` beside the one line to change back.

**What it costs:** ep1 gains 105s (reckoning 45 + vote 25 + execution 20 + verdict 15).

| night | before | after |
|---|---|---|
| 4 episodes | 26:25 | **28:10** |
| 5 episodes | 31:50 | **33:35** |
| 6 episodes | 37:15 | **39:00** |
| worst case (3 noms every episode at `EPISODE_CAP`) | 34:50 | **37:20** |

Still inside the forty minutes `round-loop` R2c guards — that assertion is what says the decision
was affordable, and it is the one that will fail first if any beat's duration grows.

**New gate `episode-order` (9/0)** is the real protection, and it asserts *agreement*, not an
order: it derives the expected live walk from `orderFor`, so it follows any future change to the
running order and fails only when the halves drift apart again. Verified to fail 4 of 9 when
`orderFor`'s branch is put back. Inverted with it: `round-loop` R2/R3/R3b/R3c, `party-night`
N17c/N18.

## 4. TV / phone desync risks

- ~~**Optimistic host beats.**~~ **CLOSED 2026-08-28**, and it was carrying a second bug: `ui.locked`
  was assigned once and cleared nowhere, so after the first pair of the night the 3·2·1 could never
  arm again and every later casting round waited out the 45s server backstop. `resolveBeatClaim`
  makes a locally-set beat provisional for 4s and then defers to the last beat the SERVER named.
  Gate: `host-desync` (26 assertions, control red on 9).
- **Stale-frame lobby drop.** `party-phone.js:344,465` still falls back to `frame.phase === 'LOBBY'`,
  so a late frame can drop a phone to the lobby sheet mid-beat. The comment at `:445` records this
  being fixed for talk beats only.
- **Two clocks on one screen.** `state.phase` can already read VERDICT during a live expedition
  (`party-host.js:809`). The TV suppresses it; the phones do not all know to.

## 5. Gate coverage — what is locked, what can regress

CI (`.github/workflows/gates.yml:44`) runs the full `gates:party` chain on every push and PR.
All referenced scripts exist — 28 of them as of 2026-08-28, the four newest being `nominee-skin`,
`seated-actions`, `accusation-stage` and `party-audio`.

| Playtest finding | Fix | Gate | Status |
|---|---|---|---|
| **Every phone could identify the Glitched, on every live episode** | `playEpisode`'s claim loop deleted | `party-isolation` I3b (rewritten), I3c, control `leak: 5` | ✅ locked — **and the old I3b was CIRCULAR**, see below |
| A field with no matrix row was dropped in silence | `project()`'s `unrowed` is banked, not discarded | `party-isolation` I1c, control `leak: 6` | ✅ locked — went red on first run against a pre-existing silent drop |
| Empty ballots invented a pair at N=8 | `7d21bb1` | `party-night.mjs:366` + `:306`, `party-sockets.mjs:80` | ✅ locked, 3 gates |
| 3·2·1 armed on the first ballot | `e5d81f9` | `cast-ballot.mjs:200-205` (B12b–e) + `party-warm.mjs:1483` greps the old rule is gone | ✅ locked |
| Self-vote on the lynch ballot | `6fa0ae4`, `f4800bc` | `vote-table.mjs:108`, `party-night.mjs:191`, `:560` | ✅ locked |
| Border doorways opening into void | `ee9f161` | `party-warm.mjs:2157` — `voidOpen===0 && outsideOpen===0` across 24 seeds | ✅ locked |
| Props clipping into doorway apertures | `ee9f161` | `party-warm.mjs:2163` (+ `W34e` control) | ✅ locked |
| **Smash target hidden behind furniture** | — | `target-sight.mjs`, **red on the shipped arm, out of the CI chain on purpose** | 🚨 **guarded at last, and it REPRODUCES: 24/64 seeds bury the painting, worst case 13% visible** |
| **Eight name tags bury each other — 97% of one name** | — | `tag-census.mjs` T7, **red on the shipped arm and out of the CI chain on purpose** | 🚨 **measured, unfixed — the fix is inside a locked rule and needs John** |
| sitLock TDZ crash on walk-in | `105b77d` | `_sit_in_chair.mjs:195`, `party-warm.mjs:2105` | ⚠️ locked by **string-index grep on source order**, not runtime. Renaming an identifier passes the gate and reintroduces the TDZ. |
| Missing nominate window after Debrief | `e94b308` | `party-night.mjs:639-644` | ✅ locked |

### The circular gate, written down because it will happen again

`party-isolation` I3b was named *"every claim on the wire was published by its owner"* and did not
test that. It accepted a claim as owner-published if the event log held a PUBLIC
`player.claim_set` — an event the server manufactured itself, in the same loop that wrote the
value. The server published the claim, then cited its own publication as proof the owner had
published it. **That gate reported 20 passed / 0 failed, including all four of its blindness
controls, while `players[].claim` carried a column reading `contestant` for everyone except the
Glitched to every phone on every live episode.** Reproduced at castSeed 5, 17 and 42.

The generalisable fix, and the thing to copy the next time provenance is asserted anywhere:
**assert against the DRIVER's record of what it published, never the server's record of what it
did.** The driver is outside the thing under test; the log is inside it.

This is also why §5's row for `sitLock` carries a ⚠️ rather than a ✅, and why W36a and W38d were
both rewritten the same week: a gate that pins a spelling, a call site or a self-report is
measuring the wrong surface, and three of them on this project did.

## 6. The redesign pack is not in the repo

The `/design` pass produced a canvas (Direction B, "Rundown Rail") and the project lead reported
writing a plan, a prompt and 17 reference PNGs into the repo. **None of them are tracked:**

```
web-prototype/docs/design/prime-time-loop-redesign-plan.md   MISSING
web-prototype/docs/design/PROMPT-claude-loop-redesign.md     MISSING
docs/design/RUN-CLAUDE-LOOP-REDESIGN.bat                     MISSING
docs/design/refs-loop-redesign/*.png                         MISSING (only 2 .md notes tracked)
```

PNGs are not gitignored — 114 are tracked elsewhere. So these were written to John's PC during the
window when "file writes from here are half-blocked", and exist only there. **Recover them from
`C:\Users\John\Documents\Run Robot Run\` and commit them, or the visual direction has no source of
truth in the repo.** The canvas itself is at
`https://claude.ai/code/artifact/48c34074-aff5-4d50-b63b-71fd22981426`.

## 7. Where it stands

**Done, as two commits with the gates that prove them:**

1. ✅ **Every episode runs the full order** — §3. `episode-order` 9/0.
2. ✅ **Server-side casting backstop** — a dead TV tab can no longer hang a room. `party-night`
   N20a–e, 6 assertions against a real server and real sockets, including killing the TV socket
   with ballots already in.
3. ✅ **The Glitched no longer reaches the phones** (2026-08-28) — the leak above, plus the
   accusation staging that found it: a nominee wears their own tag skin, the seated circle plays
   toward the accusation, and the TV has a voice whose cue table is finite on purpose, because a
   sting that rode the real margin would leak through magnitude with nothing wrong on screen.
   Gates: `party-isolation` 24, `nominee-skin` 23, `seated-actions` 29, `accusation-stage` 51,
   `party-audio` 60.

All three verified to fail when reverted. Full suite after: **`npm run build` clean, 28 gates,
1273 assertions, 0 failures**, plus `loop-ui-play` 22/0 against eight real phones.

**Then, 2026-08-28 — the night got an ending:**

2a. ✅ **Verdict on the wire**, with the fold extracted rather than copied.
2b. ✅ **The Reunion**, and with it the first conditional edge in the whole wire.
2c. ✅ **SKIP TO REUNION** — the first emitter rule W6 has ever had.
2d. ✅ **The season-length disagreement** between the two machines, found by driving a live room
    to the cap and watching it stop one episode early. See §1.

**Still open, cheapest first:**

3. **Commit the redesign pack.** It is not in the repo *and not on John's PC either* — see §6.
   Only the design canvas survives. This is the one item that is losing information every day.
4. ~~A smash-target visibility gate~~ — **built 2026-08-28 as `harness/target-sight.mjs`, and it
   caught the bug rather than clearing it.** What is open now is the FIX, not the gate: a shared
   slot between `follow-bed.js:611` and `furn-layout.js:238`, a `vitrine` whose drawn half (0.651)
   exceeds its inset (0.62), and `planPasses` asking the region graph for doors it cannot see.
5. ✅ ~~**Decide Verdict.**~~ **Done 2026-08-28** — the wire grew to it. `WIRE_MISSING` is empty.
6. ✅ ~~**Reunion**~~ **Done 2026-08-28** — it has a caller, a beat, a reveal fanout with a closed
   schema, a TV screen and a phone sheet. A session ends; `win-machine` W10/W10c and `party-night`
   N17n assert it in both machines.

   **What is still staged inside it, and staged honestly:**
   - **The Director's Cut has no footage.** `decisiveEpisode` returns a bare
     `{episode, because, atSeq}` pointer and the beat prints exactly that, saying the footage is
     not cut yet. Replay is its own slice.
   - **The award gap.** The design lists eight; `reunion.js` computes six. The two uncomputed —
     The Klutz and The Liar in the Ear — need events nothing writes yet.
   - **The chat beat is empty** until something posts `chat.posted`. `chatUnmixed` is wired and
     will fill in the day it does.
   - ✅ ~~**`COMPOSITION[n].cameras` and `WIN_TARGETS[n].cameraTarget` disagree**~~ **8p locked
     2026-08-30** — both 4. Chrome `needed` and W2 `cameraTarget` match at eight. The Verdict
     plate still reports the fold's `need`.
7. **Delete the dead `room.js:34` `PHASES`** — five stale phases, imported nowhere, beside a
   `setPhase` that validates nothing.

**§4 is down to two.** The optimistic-host-beat risk — the one this document called the most
likely to bite in a real session — is closed, with `host-desync` guarding it. Still live: the
stale-frame lobby drop (`party-phone.js:344,465`) and two clocks on one screen.
