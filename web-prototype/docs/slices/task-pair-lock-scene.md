# Slice: pair-lock scene before the run

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `f8c83fd` (PR 64 merged). Spec, not the night. Do not invent a camera.
Do not merge. Do not start Max. Still Grok. **Do not dump this onto PR 65.** Game builds
this after 65.

John, 2026-09-02 (Grok, 5hr spent until ~6:20pm Brisbane): tense scenes / intros for every
player-interaction moment. First lock: when runner and guide are picked, a scene plays out
BEFORE the run — do not jump straight into the expedition.

Verified on `main`:

- Casting 3·2·1 arms on all living ballots in, or `CAST_BACKSTOP_MS` 20s (`ballot.js`).
  Then `t:'episode'` starts the run. `show.js`: *"Expedition is immediate so the TV is never
  waiting on a click."* That immediate jump is the defect.
- `SHOW_BEATS` has no sendoff beat. Accusation does not have its own beat either: it plays
  ON Reckoning (`accusation-stage.js`, ~4s stand/flinch/settle, keyed `nominator>target`).
- Execution is already a walk (`execute-hit` / `planExecute`): nominator stands, walks the
  inner ring, swings. Same class of performance, already on air, no new camera.
- `TALK_BEATS` does not include `casting`. Casting chrome is the full-bleed overlay + 3·2·1.
  The seated circle is the picture for talk beats (`onStage`). A sendoff covered by the
  overlay is a scene nobody sees.
- `READY_BEATS` is debrief + reckoning only. Casting 3·2·1 is a different rule and must not
  be merged with READY.
- Sit lock stays on for a stand-in-place clip (`accusation-stage` header). Do not drop it.

---

## 0. Why this slice exists

The pair lock is the first time the room has two names to watch, and the show currently
cuts them into the mansion. Accusation and execution already perform on the bodies in the
ballroom. Pair-lock needs that class of picture, then the run. Overlapping the scene with
the expedition (or skipping it in the sim) is the same bug as overlapping noms.

---

## 1. File ownership

**You may edit these.** Anything else is another owner's. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-pair-lock-scene.md` | this file |
| `src/game/pair-lock-stage.js` | **new**, THREE-free, same shape as `accusation-stage.js`: `planPairLock` + `createPairLockStage`. Keyed `runner>guide` for this episode |
| `src/game/intro-bed.js` | drive the stage (owns the picture, like `setNominees`). Re-export. Do not invent a camera |
| `net/party/local.mjs` | the hop that currently fires `t:'episode'` into expedition immediately. Wait until the pair-lock performance is finished, then `setShow('expedition')` |
| `src/views/party-host.js` | after 3·2·1, drop the casting overlay so `onStage` seated circle is the picture for the sendoff; cue runner+guide ids the bed already has |
| `src/views/party-phone.js` | pads wait (no expedition sheet) until the sendoff is finished; do not grow a map |
| `harness/pair-lock-stage.mjs` | **new**. Plan times, key once, finished before expedition, sim does not skip |
| `harness/party-night.mjs` | 3·2·1 still locks the pair; expedition does not air until sendoff finished |
| `harness/cast-ballot.mjs` | 3·2·1 / all-living / 20s backstop **unchanged** |

**Do not edit:** `follow.js` chase/top/crane (expedition camera stays the locked produced follow).
Hunter art. Expedition pads / auto-walk. PR 65 files. Live 5178/5181 checkout. `sitLock`.
`SHOW_BEATS` / `episode-order` (no new beat).

---

## 2. Closed list of people-scenes

John asked for tense scenes on every player-interaction moment. That is a **closed list of
performances on the seated circle**, not a new SHOW beat per clock tick.

| moment | status | this slice |
|---|---|---|
| Pair lock → sendoff, then expedition | missing; 3·2·1 jumps to the run | **build** |
| Nomination accusation | `accusation-stage` (~4s) | do not rebuild |
| Execution walk + hit | `execute-hit` / `planExecute` | do not rebuild |
| Vote close / tally | chrome, not a stand-up | out |
| Recap card | outcome word, not people | out |
| Debrief | seated talk, phones down | out |
| Verdict plate | status / cameras | out |
| Reunion roll call | already slow plate flips | out |
| Whisper | two private phones, not TV | out |
| TV E camera stinger | already the mount moment | out |

A fourth people-scene is a new slice. Do not invent one here.

---

## 3. Pair-lock sendoff — decisions already made

### 3.1 When it plays

After the pair is locked (3·2·1 finished, or the 20s ballot backstop resolved a pair), **before**
`setShow('expedition')`. Empty ballot box still waits; this scene never invents a pair.

### 3.2 No new SHOW beat

Accusation plays ON Reckoning. Sendoff plays ON Casting after lock. Do not add `sendoff` to
`SHOW_BEATS` (that reddens `show-beat` SB2 and `episode-order` E2). Chrome word can still say
the two names — the plates already have them.

### 3.3 Performance (same class as accusation)

Bodies already on air. Clips already in the seated GLB. No new geometry, no new bake, no cut,
no new follow mode.

```
PAIR = {
  STAND_RUNNER: 0.00,
  STAND_GUIDE:  0.40,
  SETTLE:       2.00,
  FADE:         0.25,
}
clip stand: Sit_to_Stand_Transition_M  (hold true, same as accuser)
```

Runner stands at 0. Key `runner>guide` for this episode. Guide stands at 0.40 so it is a
scene, not a chorus line. Settle/hold at 2.00. Finished = last beat + FADE (2.25s planned;
header may say roughly four seconds of clips, same as accusation).

Reactors: **none** on sendoff. Who gasps is a leak surface on Reckoning; a sendoff gasp would
be the same leak with no accusation to justify it. Only the two named chairs move.

Seat lock stays on. The clip does the travelling (`Sit_to_Stand_Transition_M` under a pinned
root). Do not drop `sitLock`. Do not walk them to the mansion door — that is the expedition.

Identify by `runner>guide`. A re-cue of the same pair is a no-op (same as accusation keys).

### 3.4 Picture, not a camera

Do not invent a camera. Do not add a follow mode. Do not put the guide flyover on the TV.

The picture is the **seated circle in the ballroom** (`onStage`), same as Reckoning. After
3·2·1 the casting overlay must not cover it. Expedition's produced follow (chase in the
ballroom, top over the runner's rooms, crane between) starts when the sendoff is finished,
not during it.

Phones stay controllers. No 3D on the phone. Expedition sheets (Guide E / Runner D) do not
replace the casting sheet until the sendoff is finished.

### 3.5 Wait — the overlap bug

Next beat cannot start until the sendoff is finished. `t:'episode'` / `playEpisode` /
`progressShow` must not pin `expedition` while `createPairLockStage` still has pending cues
or held stands that have not reached SETTLE+FADE.

Ready-up skip does **not** apply (READY is debrief/reckoning). Casting 3·2·1 skip stays.
Sendoff wait does **not** skip, including in the sim.

`CASTING_BACKSTOP_MS` is a net for a dead TV tab during ballots. It must not fire the run
mid-sendoff. If the 45s casting net hits during the scene, **finish the scene**, then
expedition.

### 3.6 40min bar

~4s per episode × `EPISODE_CAP` is ~20s. Do not touch `RECKONING_CAP` or `sessionSeconds`.

---

## 4. Traps

- `show.js` header *"Expedition is immediate so the TV is never waiting on a click"* is the
  line this slice deletes. Update that comment when the wait exists, or the next reader will
  "fix" the wait back to immediate.
- Do not merge this wait with `READY_COUNTDOWN_MS` or with `CAST_BACKSTOP_MS`. Three different
  3-second-looking numbers, three different rules.
- `host-desync` / `ui.locked`: 3·2·1 already uses the lock. Sendoff is still casting; do not
  leave `ui.locked` true into expedition (that was the bug that killed later 3·2·1s).
- `CUE_KEYS.run` is a closed list. Do not put sendoff fields on the run cue.
- Never `npx vite build`. Never backticks inside `/* glsl */` template literals.
- Do not remount 5178/5181. Do not kill Chrome. Do not edit the live sit-down checkout.
- Do not start Max. Do not dump onto PR 65.

---

## 5. Verification

Node-only. Live table is out.

```
npm run gates:party
node harness/pair-lock-stage.mjs
node harness/party-night.mjs
node harness/cast-ballot.mjs
node harness/accusation-stage.mjs
```

Must go RED if: `t:'episode'` pins expedition before SETTLE+FADE; sim skips the sendoff;
casting overlay still covers `onStage` during the stands; a new `SHOW_BEATS` entry appeared;
`sitLock` was dropped; a follow mode was added; reactors gasp on sendoff; PR 65 was used as
the branch.

If a stated fact is wrong, say so in the report rather than diverging silently.
