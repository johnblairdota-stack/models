# Slice: Prime Time live night — Debrief TV + lynching nomination

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Canonical rules: `docs/design/rrr-social-round.md` §1 (round loop) and §3
(nomination / vote / execution). Logic is already pure in `src/party/vote.js`.
John, 2026-08-24: after Recap, minimise the recap, put the ballroom seated
robots on the TV during Debrief with a visible countdown, then run the designed
lynching nomination, then open the next Casting.

---

## 0. Why this slice exists

PR #31 walked Recap → Debrief → Casting. Debrief today dumps the full recap
card plus a seat grid over the TV, has no countdown, and jumps straight to
Casting. The designed Reckoning → Vote → Execution never airs on the live
show clock.

Two clocks stay separate:

- **`playEpisode`** is still the gate/sim machine. Episode 1 still skips
  Reckoning+ via `orderFor` / `premiere()`. Gates that only call `playEpisode`
  stay green.
- **`SHOW_BEATS`** is what TV and phones paint. For the **live SHOW clock**,
  Debrief → Reckoning → Vote → Execution → Casting runs on **every** episode
  including episode 1. John is playtesting after the ep1 smash and wants the
  nomination.

---

## 1. File ownership

**You may edit these.** Anything else is another owner's.

| file | what changes |
|---|---|
| `docs/slices/task-prime-time-debrief-lynch.md` | this file |
| `src/party/show.js` | beats, holds, `nextShowBeat`, `AFTER_RUN` chain, remain helpers |
| `src/party/room.js` | live enterReckoning / nominate / vote / execution |
| `src/party/vote.js` | reuse; tiny exports only if a gate needs them |
| `src/party/night-client.js` | re-exports + `until` / noms / lynch on the client |
| `net/party/local.mjs` | progressShow chain, timers, nominate/vote messages, `until` |
| `src/views/party-host.js` | mini recap, ballroom talk picture, countdown, nom/vote/exec chrome |
| `src/views/party-phone.js` | debrief timer; nominate sheet; vote sheet |
| `src/party/night-skin.js` | talk overlay + mini recap + clock (no backticks in CSS comments) |
| `harness/party-night.mjs` | clock walks recap→…→casting; countdown published; nominate API |
| `harness/party-warm.mjs` | source asserts for the new chain |

**Do not edit:** dual-stick / chase math, `:5184`, Producer chair, inventing
CAUGHT, `run.js` WINDDOWN, Recap *button*. Touch `follow.js` / `follow-bed.js`
only if the existing warm/intros cue cannot put the seated circle on Debrief.

`net/party/server.js` — parity only if a gate you touch requires it. The
playtest path is `local.mjs` on :5181.

---

## 2. The live clock

```
SHOW_BEATS = lobby, casting, expedition, recap, debrief, reckoning, vote, execution
AFTER_RUN  = recap → debrief → reckoning → vote → execution → casting
```

Holds from `phases.js` `SECONDS` (not a second table):

| beat | ms |
|---|---|
| recap | 10_000 |
| debrief | 75_000 |
| reckoning | `reckoningSeconds(noms) * 1000` — 45s base, +15s/nom, cap 90s |
| vote | 25_000 |
| execution | 20_000 |

Always include the execution beat. If nobody cleared threshold the TV says so,
then Casting. Simpler clock than skipping the beat.

`progressShow(room)` walks the chain. Timeouts call the same function. Gates
must not sit 75+45+25+20 seconds.

On entering each timed beat, publish an authoritative deadline:

```
{ t: 'show', beat, end?, until }   // until = epoch ms
```

Add `until` to `FANOUT_KEYS.show`. Clients tick locally from `until`. Do not
invent a second clock on the TV.

Reckoning extends: store `reckoningStartedAt`, recompute
`until = started + reckoningSeconds(n) * 1000`, reschedule the timeout, refan
`show` with the new `until`. Close early when `reckoningClosed` is true.

---

## 3. Recap → Debrief TV

After recap hold: `setShow(debrief)` + `enterDebrief()` (already).

1. **Minimise recap.** Do not paint the full `recapBoard` + `seatGrid`. A small
   corner/strip (SMASHED/TIME · camera lit · runner fact) is the whole leftover.
   Main picture is the 3D ballroom.
2. **Focus ballroom cameras.** `onRun` stays false (`onTalk` includes debrief
   and the new social beats). Follow mode is **not** chase. Clear `cuedRunner`
   with `{ kind: 'idle' }` if a chase is still up, then cue `{ kind: 'intros',
   cast }` so the seated circle is back in the ballroom (intros were disposed
   on the run cue). Place the follow layer like intros (front, framed), not
   the dim lobby-warm backdrop.
3. **Visible countdown.** Chrome: `DEBRIEF · episode N · M:SS` or `Ss`. Large
   readable remaining time on the TV overlay. Phones show the same remaining
   time; phones stay "phones down — talk" (no pad, no nominate yet).

Drop host copy that says "No eviction this episode" / "Nobody is evicted
tonight" — that is no longer true on the live path.

---

## 4. Reckoning / Vote / Execution (live, vote.js rules)

On entering reckoning: `setPhase('RECKONING')`, clear nominations for the
episode, fanout standing list, start 45s.

Phones: living others only (`nominationPlayers`). Tap → `{ t: 'nominate',
target }`. Server calls `vote.js` `nominate()` with **seated living** (empty
Robot N chairs are not living for this clock). Broadcast `nom.made` via the
room log. Fan `{ t: 'noms', standing }`. TV shows the standing list.

Rules, live, not gate-only:

1. Any living player may nominate once per episode; dead never nominate.
2. Target living, at most once, no self-nom.
3. Standing cap 3; first tap wins.
4. Window 45s +15s/nom, cap 90s; early close when every living has nominated
   OR cap hit (`reckoningClosed`).
5. Vote: one simultaneous 25s ballot; standing nominee or `NO_ONE`; non-voters
   = `NO_ONE`. `{ t: 'lynchVote', choice }`. Votes stay off the fanout until
   tallied (design §4: `vote.cast` SEALED until `tallied`).
6. Threshold: strictly more than half of **seated living**, not votes cast.
   Ties never execute.
7. At most one execution; nominator swings (or `SHOWRUNNER` if nominator was
   taken this episode). Apply via existing `applyTake` + `player.executed`
   path from `playEpisode`.
8. No alignment reveal on death.

Then `beginCasting()` + `setShow(casting)` (pair clear already from #31).

Do not put nominations on the state frame unless you row them in `entitle.js`.
Prefer the public side-channel (`noms` / `lynch`) like `ballots`.

---

## 5. Traps

- `setShow` refuses unknown beats. New beats must be on `SHOW_BEATS`.
- `playEpisode` still increments `episode` before the live walk. Chrome uses
  `airingEpisode`.
- Seated living, not the eight-chair capacity deal, is the vote denominator
  on a two-phone table.
- Extra fanout keys without `FANOUT_KEYS` rows throw at `fanout()`.
- No backticks inside `/* glsl */` or night-skin CSS comments in template
  literals.
- Dual-stick / chase (#29 / #30) is not this slice.
- Do not invent CAUGHT. Do not restore the Recap button.

---

## 6. Verification

```
node harness/party-night.mjs
node harness/party-warm.mjs
node harness/vote-table.mjs
node harness/round-loop.mjs
npm run gates:party
npm run build
```

Live path after smash/TIME: Recap (~20s) → Debrief (mini recap, ballroom
seated, countdown) → Reckoning (phones nominate, TV standing, timer extends)
→ Vote (living-majority) → Execution or nobody → Casting for the next pair.

---

## 7. Playtest fix — nominate window John never saw (after #32 / `0ccb3d6`)

John, after PR #32: *"there was no way to nominate a player for the lynching."*
The wire was fine (`{t:'nominate'}`, vote.js, TV `noms`). The table never got
an affordance they could use.

1. **Phones down for 75s, then a 45s window.** Debrief copy told everyone to
   put the pad down. Reckoning is 45s and used to auto-advance with zero noms.
2. **Paint gate.** `beat === 'lobby' || phase === 'LOBBY'` (and
   `frame?.phase || 'LOBBY'`) could steal the sheet. Talk/lynch beats
   (`debrief|reckoning|vote|execution`) now match **before** the lobby branch.
3. **Empty Reckoning hold.** The timer path (`expireShowHold`) re-arms 45s
   up to `EMPTY_RECKONING_EXTEND_CAP` (3) when `nominations.length === 0`.
   `progressShow` still walks for gates. After the cap: Vote → Execution
   "nobody cleared" → Casting. ≥1 nom keeps early close + timer-to-vote.
4. **Wake-up.** Reckoning buzzes the pad (same smash pattern). Late debrief
   (`remainingMs ≤ LATE_DEBRIEF_MS` = 20s) shows the pick-list; first tap
   enters Reckoning then applies vote.js. TV empty standing:
   "Waiting on phones — nominate."
