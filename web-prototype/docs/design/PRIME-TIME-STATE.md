# PRIME TIME — state of the night loop

Audited against `main` @ `5752c22` (PR #49), 2026-08-25. **Updated after two fixes landed** —
see §3 and §2, and the two patches that go with this document.
**Updated again 2026-08-28** on `claude/casting-screen-layout-crgctg` — §5 has a new top row, and
§7's "done" list has a third entry. The chain is 28 gates and 1273 assertions now, not 24 and 822.
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
| 3 | `src/party/show.js:16` | lobby, casting, expedition, recap, debrief, reckoning, vote, execution | **The wire.** What actually runs. Driven by `net/party/local.mjs:204` `progressShow`. |
| 4 | `src/party/room.js:34` | LOBBY, CASTING, EXPEDITION, DEBRIEF, VERDICT | **Dead.** Imported nowhere. `setPhase` (room.js:299) validates nothing. Delete it. |

**#2 and #3 disagree, and #3 wins at runtime.** That is the single most important fact about this
codebase right now.

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
| **Verdict** | **not on the wire** | — | `AFTER_RUN_NEXT.execution = 'casting'` (`show.js:121`). Exists in `phases.js`, on the TV rundown rail as a label, and inside the offline `playEpisode` (`room.js:563`). `show.js:22` admits it: *"the wire has not grown it yet."* **Staged, not broken — but the rail shows a beat that never lights.** |
| **Reunion** | **stub** | — | `src/party/reunion.js:165` is a pure log-query function with no caller outside `harness/reunion-truth.mjs`. No phase, no beat, no view. **Nothing ever ends a session.** |
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

- **Optimistic host beats.** `party-host.js:534` and `:549` set `ui.beat` locally before the server
  fans out. If `t:'episode'` early-returns (`local.mjs:813`), the TV sits on *expedition* with
  `ui.locked=true` while every phone stays on *casting*, with no recovery path.
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
| **Smash target hidden behind furniture** | — | **none** | 🚨 **unguarded — "I couldn't see the painting" can come straight back** |
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

**Still open, cheapest first:**

3. **Commit the redesign pack.** It is not in the repo *and not on John's PC either* — see §6.
   Only the design canvas survives. This is the one item that is losing information every day.
4. **A smash-target visibility gate** — the last live-found bug class with no regression net.
   "I couldn't see the painting, it was behind the furniture" can come straight back.
5. **Decide Verdict.** Grow the wire to it, or drop it from `RUNDOWN_BEATS`. Either is fine;
   advertising a beat that never lights is not. `episode-order`'s `WIRE_MISSING` names it so the
   choice stays visible.
6. **Reunion** — the designed payoff for D5, and the reason the event log schema was shaped the
   way it was. Currently a function with no caller, and the reason nothing ends a session.
7. **Delete the dead `room.js:34` `PHASES`** — five stale phases, imported nowhere, beside a
   `setPhase` that validates nothing.

**And one thing the fixes did not touch:** the TV/phone desync risks in §4 are all still live.
The optimistic-host-beat one (`party-host.js:534`) is the most likely to bite in a real session.
