# Slice: sequential unique nominations, then get off the wreck

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `a22439f`. Spec, not the night. Do not invent a camera. Do not merge.
Do not start Max. Still Grok.

John, 2026-09-02 (Grok, 5hr spent until ~6:20pm Brisbane): 8-player sim ready-up skip is
fine. Bots then dump nominations immediately; two land; stand + accused anims overlap and
never finish. Execution cam is mostly good, then lingers too long after the hit, and the
body does not fall into a believable ragdoll.

Verified on `a22439f`:

- `src/party/vote.js` — `STANDING_CAP = 3` (not 2). Unique target already refused
  (`already nominated this episode`). `canNominate` also refuses at cap
  (`standing-nomination cap reached`). `reckoningClosed` ORs cap **or** every living has
  spent their nom.
- `src/game/accusation-stage.js` — `ACCUSE` STAND 0 / FLINCH 0.40 / GASP 0.80 /
  GASP_STAGGER 0.22 / SETTLE 2.00 / FADE 0.25. Keyed `nominator>target`; a new key fires
  a new beat. Header says ~4s performance. Simultaneous landing is why they clip.
- `src/party/phases.js` — `RECKONING` 45s floor; `RECKONING_PER_NOM = 15`;
  `RECKONING_CAP = 90`; `reckoningSeconds`. Worst-case “three noms every episode” → 37:20,
  inside 40min (`round-loop` R2c).
- `harness/nom-receipt.mjs` — NR8 asserts cap **closes** Reckoning so a fourth tap sees
  `not reckoning`; NR1c expects the unprovoked reason to be `standing-nomination cap reached`.
- `src/game/execute-hit.js` — `WRECK_HOLD_S = 2.40`; talk-cycle `WRECK_SHOT` dur **10.0s**;
  `wreckPose` is a posed settle (`y: floorY` at `u=1`) not a physics ragdoll. `chairTopple` exists.
- `src/party/follow.js` — last-look is already hard-cut on death, no linger. The linger is
  after contact, on the wreck hold/plate. Do not invent a camera.

---

## 0. Why this slice exists

Tension is one accusation at a time. A count cap of two (or the code's three) is the wrong
fix: unique targets already refuse a duplicate pick. The bug is simultaneous landing, not
how many names can stand. After the sledge reads, the show has to leave the wreck; a 2.4s
hold plus a 10s talk-cycle wreck plate is a linger, and a posed settle still reads seated.

---

## 1. File ownership

**You may edit these.** Anything else is another owner's.

| file | what changes |
|---|---|
| `docs/slices/task-nom-sequence.md` | this file |
| `src/party/vote.js` | drop `STANDING_CAP`; unique-target refuse stays; sequential gate lives here or is called from here |
| `src/party/phases.js` | `RECKONING_CAP` 90s stays a TIME wall, not a count cap. Copy that names “three nominations” in the 40min note must follow the new worst case |
| `src/game/accusation-stage.js` | export when a `nominator>target` performance is finished (last planned beat + fade). Do not change clips or invent a camera |
| `src/party/room.js` (or the one hop that currently calls `nominate` from a phone tap / sim dump) | refuse a new nom while a performance is in flight. Same rule in the sim |
| `src/game/execute-hit.js` | shorten `WRECK_HOLD_S`; stop the 10s wreck talk plate; `wreckPose` at `u=1` must read as wreckage on the floor, not a seated hold |
| `harness/nom-receipt.mjs` | NR8 / NR1c currently assert the cap reason. Rewrite as executed negatives |
| `harness/accusation-stage.mjs` | assert two noms in one tick become one landing + wait, then the second after finish |
| `harness/party-sim.mjs` | ready-up skip STAYS. Nomination wait does NOT skip. Sequential unique noms in the dump |
| `harness/round-loop.mjs` | R2c 40min bar. Worst case is 90s reckoning (already the cap), not `STANDING_CAP * 15` |
| `harness/execute-hit.mjs` | existing H11 / H12 / H14 / H15. Tighten: hold is short, pose is down. Do not invent a new camera gate |

**Do not edit:** `follow.js` last-look hard-cut (already no linger on death). Hunter art.
Expedition pads. Live 5178/5181 checkout. `sitLock` (stays on for the robot who stands up).

Paths above are under `web-prototype/`.

---

## 2. Sequential unique nominations

### 2.1 No standing-count cap

Delete `STANDING_CAP` and every `nominations.length >= STANDING_CAP` /
`'standing-nomination cap reached'` branch.

`canNominate` stays: living, once per episode.
`canBeNominated` stays: living, not self, **not already a target this episode**.
Duplicate pick = no nom, not a second target.

`reckoningClosed` is now:

1. every living player has spent their nom, OR
2. no living player has a legal unique target left, OR
3. the 90s wall hit (after finishing an in-flight accusation).

### 2.2 Nominations are sequential

After a nom lands, the next nom cannot land until that `nominator>target` accusation
performance is finished. Identify by the existing key.

Finished = last beat in `planAccusation` (`SETTLE` 2.00 + `FADE` 0.25) has elapsed.

In-flight refuse why: a **new** string, `accusation playing` — not `already nominated this episode`
(phones must disambiguate; that old string is produced by BOTH `canNominate` and `canBeNominated`).

Bots in `party-sim` dump in the same tick today; the server/sim must queue or refuse-until-clear,
not apply two `nominate`s on one frame. Sequential wait is on LANDING, not on `setNominees` /
`cueNominees` fanout (accusation-stage already no-ops a key that is still there).

### 2.3 Ready-up skip stays

Only the nomination wait is mandatory, including in the sim. Ready-up skip is still legal.

### 2.4 40min bar

`RECKONING_PER_NOM` 15s and `RECKONING_CAP` 90s already bind: `reckoningSeconds(3)` and
`reckoningSeconds(7)` are both 90s. Dropping the count cap does not add a minute per extra name.
Do **not** raise `RECKONING_PER_NOM * 7` in `sessionSeconds` — that blows 40min.

Worst-case session math in `phases.js` / `round-loop` R2c must use the 90s wall, not
“three nominations”. Seven unique standing names are allowed; they play inside 90s because
each performance is ~2.25s planned (header says roughly four seconds of clips).
7 × 4s = 28s of accusation, which fits.

If the 90s wall hits mid-performance, **finish that accusation**, then close. Remaining unspent
unique picks after the wall are lost to **time**, not a standing-count cap. Bots dumping
instantly all get unique noms in ~28s. Do not recap at 2.

---

## 3. Execution: after the hit reads, get off it

Lock: after the hit reads, get off it; the body has to read as wreckage, not a seated hold.
Gate whatever proves the hold is short and the pose is down. Do not invent a camera.

### 3.1 Hold is short

`WRECK_HOLD_S` is 2.40 today — cut to **0.50s** (contact reads, then off). Gate: `WRECK_HOLD_S <= 0.60`.

`WRECK_SHOT.dur` is 10.0 today and `talkCycleShots` appends it whenever there is wreckage —
**do not append a wreck plate to the talk cycle** (or dur 0). Linger is the hold/plate after
contact, not `follow.js` last-look (that path is already hard-cut). Do not add a new follow mode.

### 3.2 Pose is down

Not a physics ragdoll engine. `wreckPose(..., u=1)` already sets `y: floorY`. The mesh still
reads seated if it keeps a sit/idle clip on a posed settle.

At `u=1`: root/hips at `floorY`, clip is a down/wreck pose (or last contact frame frozen on
that transform) — not `Sit_*` hold. Chair topple stays. CLAUDE.md already locks dead as
wreckage / `holdDead` / on-back slack; this slice makes the pose and the hold match that lock.

Gate: `wreckPose({u:1}).y === floorY` (not chair height); pose clip at u=1 is not a sit hold;
`WRECK_HOLD_S <= 0.60`; talk cycle does not contain a 10s wreck shot.

---

## 4. Presentation

TV follow already exists. Do not invent a camera. Last-look hard-cut stays. The wreck is
standing set dressing the existing follow can already find; get off the hit plate when the
hold ends.

Phones: unique-target refuse stays the old string; in-flight sequential wait uses
`accusation playing` so a dump does not look like “you already nominated”.

---

## 5. Traps

- `already nominated this episode` is produced by BOTH `canNominate` (you spent yours) and
  `canBeNominated` (they are on the block). Do not reuse that string for in-flight sequential wait.
- NR8 today: three standing names CLOSE reckoning so a fourth tap is `not reckoning`, and NR1c
  wants the unprovoked reason to be the cap. After this slice those rows must go red if they
  still mention a count cap — rewrite them as executed negatives (old cap is gone).
- `setNominees` / `cueNominees` re-sends the same standing list; accusation-stage already no-ops
  a key that is still there. Sequential wait is on LANDING, not on the fanout.
- Seat lock stays on for the robot who stands up. Do not drop `sitLock` to “fix” overlap.
- Never `npx vite build`. Never backticks inside `/* glsl */` template literals.
- Do not remount 5178/5181. Do not kill Chrome. Do not edit the live sit-down checkout.
- Do not start Max. Game builds this on the PC Claude pool after the slice exists.

---

## 6. Verification

Node-only. Live table is out.

```
npm run gates:party
node harness/nom-receipt.mjs
node harness/accusation-stage.mjs
node harness/party-sim.mjs
node harness/round-loop.mjs
node harness/execute-hit.mjs
```

Must go RED if: `STANDING_CAP` still exists; two noms land on one tick; sim skips accusation
wait; `WRECK_HOLD_S > 0.60`; talk cycle still contains a 10s wreck shot; `wreckPose({u:1}).y`
is chair height not `floorY`; pose clip at u=1 is still a sit hold.

If a stated fact is wrong, say so in the report rather than diverging silently.
