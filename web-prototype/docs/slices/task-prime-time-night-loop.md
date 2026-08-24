# Slice: Prime Time night loop — Recap → Debrief → Casting, chapel table

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

`docs/design/party-loop.md` still wins on any disagreement about the party game.
`src/party/phases.js` is the shooting-schedule lock: CASTING → EXPEDITION → RECAP →
DEBRIEF, and episode 1 skips Reckoning/Vote/Execution/Verdict.

---

## 0. Why this slice exists

After a smash run the live night dies on Recap. The Recap *button* was removed on
purpose (PR #12); the *beat* was supposed to keep walking on the show clock. It does
not. Debrief (~75 s seated talk) never airs as a show beat, and the next Casting
never opens, so episode 2's pair pick never happens.

Second half: episode 1's smash is the gallery painting. The next expedition is
the chapel **round table** (`rrr_prop_table-round_v1.glb`), then home to the
ballroom the same way.

---

## 1. File ownership

**You may edit these.** Anything else is another owner's.

| file | what changes |
|---|---|
| `docs/slices/task-prime-time-night-loop.md` | this file |
| `src/party/mission.js` | **new** — episode → smash target, no THREE |
| `src/party/show.js` | `debrief` beat, hold times, next-beat helper |
| `src/party/room.js` | `beginCasting` clears the last pair; live recap/debrief phases |
| `src/party/follow.js` | `episode` on the run cue (public) |
| `src/party/mansion.js` | chapel must be walkable on the night plan |
| `src/party/night-client.js` | re-export the new show helpers |
| `net/party/local.mjs` | clock: recap → debrief → casting |
| `src/game/follow-bed.js` | arm painting (ep1) / table-round (ep2+); reset on run cue |
| `src/views/party-host.js` | Debrief chrome; next-casting lock; episode on run cue |
| `src/views/party-phone.js` | Debrief sheet; mission copy from `mission.js` |
| `harness/party-night.mjs` | Recap → Debrief → Casting (ep2) after a completed run |
| `harness/party-warm.mjs` | source + catalog asserts for the clock and table |

**Do not edit:** `src/game/player.js`, dual-stick / chase math in `follow.js`
(`stickCamMove`, `stepLookOrbit`, `liveRunShot`), `src/views/game.js`,
`net/party/server.js`, anything on `:5184`, Producer chair, CAUGHT.

---

## 2. The live clock (A)

Two clocks already exist. Do not merge them.

- **`playEpisode`** is the gate/sim machine. It still walks CASTING → EXPEDITION →
  RECAP → DEBRIEF → (ep1 VERDICT / ep2+ RECKONING…). Episode 1 still skips
  Reckoning+. It still increments `state.episode` at the end. Gates that only
  call `playEpisode` stay green.
- **`SHOW_BEATS`** is what the TV and phones actually paint. Today:
  `lobby, casting, expedition, recap`. After a smash, `endRunOnMission` pins
  `recap` and stops. That is the defect.

Extend the show clock:

```
SHOW_BEATS = lobby, casting, expedition, recap, debrief
RECAP_HOLD_MS   = SECONDS.RECAP   * 1000   // 20_000
DEBRIEF_HOLD_MS = SECONDS.DEBRIEF * 1000   // 75_000
```

After expedition ends (mission `done` → SMASHED, or the 8 min backstop → TIME):

1. `setShow(recap, end)` — brief recap card / outcome word.
2. After `RECAP_HOLD_MS`, `setShow(debrief)` and `enterDebrief()` (phase DEBRIEF).
3. After `DEBRIEF_HOLD_MS`, `beginCasting()` + `setShow(casting)`.

`beginCasting` must clear `state.pair` and seat roles. After `playEpisode` the
pair is still the last expedition; phones currently treat `recap.runner` as
"Locked" and the host treats any historic `cast.pair` as already locked, so
episode 2 cannot ballot. That is a stated fact this slice fixes, not a new
invention.

Export `progressShow(room)` from `local.mjs` so gates can walk the chain
without waiting 95 s. The timeouts call the same function.

Do not invent CAUGHT. Do not add a Recap *button*. Host "Ballots" on the recap
card may stay as a recovery skip; the product path is the clock.

---

## 3. Debrief chrome (A)

TV (`show === 'debrief'`):

- Chrome word is DEBRIEF · episode N (`airingEpisode`, still the episode that
  just ran).
- Not `onRun`. Follow layer goes `warm` (idle cue). Seated circle is the
  existing `seatGrid` + "Phones down — talk." Recap facts may sit above it.
- `onRun` must exclude `debrief` (today `hasPair && show !== 'recap'` would
  treat debrief as a run).

Phones (`beat === 'debrief'`):

- Outcome word if `runEnd` is set (same honesty as recap — no invented TIME).
- Clear debrief copy: phones down, talk. No pad. Role tab stays.

Late-bake intros (`maybeIntros`) must also refuse `debrief`, same as
expedition/recap.

---

## 4. Chapel table mission (B)

New pure module `src/party/mission.js`:

| episode | room | target | smash line | home line |
|---|---|---|---|---|
| 1 | `gallery` | `painting` | Find the gallery. Break the painting. | The painting is down. Get back to the ballroom. |
| 2+ | `chapel` | `table-round` | Find the chapel. Smash the round table. | The table is down. Get back to the ballroom. |

`table-round` is already `rrr_prop_table-round_v1.glb` in `furn-catalog.js` and
already prefers chapel in `CATALOG_ROOM_ASSIGN`. Do not invent a GLB.

`follow-bed.js` lives the whole night:

- Keep the episode-1 painting. Do not remove it.
- After dress, find a `table-round` FurnProp whose `spaceId` is the chapel
  (id contains `table-round`). If the catalog placed it in a study fallback,
  still use it if no chapel copy exists — and say so in the PR.
- If no prop exists, place a simple fallback mesh in the chapel centre
  (same shortcut as `buildPainting`) and say so in the PR. Art is then
  approximate.
- `run` cue carries public `episode` (`airingEpisode`). Arm the mission for
  that episode and reset `phase` to `seek`. **Without this, episode 2 starts
  already `done` and the clock yanks recap on the first world report.**
- Smash test stays an aimed ray (`runner.eye` / `runner.aimDir`), same as the
  painting. A crate next to the table does not finish the night.
- If the target is a FurnProp, `applyHit` with enough power to shatter so the
  catalog smash reads. Then `return` → ballroom `done`, unchanged.

Phones and the guide map read `missionFor(airingEpisode)` — do not hardcode
"gallery" / "painting" on episode 2.

`planPasses` also requires a chapel that can walk to the ballroom.
`PLAN_OPTS.rooms: 6` already includes chapel and `doors: 'open'`. Re-measured:
every world seed 0..23 still passes on the first candidate. The check stayed.

---

## 5. Traps

- `playEpisode` still increments `episode` before the live walk. Chrome uses
  `airingEpisode`. Do not print `frame.episode` as the episode on the air.
- `setShow` refuses unknown beats. `debrief` must be on `SHOW_BEATS` or the
  clock is a no-op.
- `CUE_KEYS.run` is a closed list. Adding `episode` without adding it there
  throws at both ends.
- Dual-stick / chase (`#29` / `#30`) is not this slice. Touch `follow-bed.js`
  only for mission arming / smash / run-cue episode. Leave `stickCamMove` and
  the look orbit alone.
- Do not wait 20 s + 75 s in a gate. Call `progressShow`.

---

## 6. Verification

```
node harness/party-night.mjs
node harness/party-warm.mjs
node harness/round-loop.mjs
npm run gates:party
npm run build
```

Live path: smash → Recap → Debrief (seated talk) → Casting for episode 2.
Episode 2 expedition targets the chapel round table, then home.
