# Slice: pair-lock sendoff is ring-center, not chair-stands

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `a7fc331` (PR 67 merged — pair-lock wait + Shot B chair-stands). Spec, not
the night. Do not merge. Do not start Max. Still Grok. **Do not dump this onto PR 65, 66, or
68.** Game builds this after.

John, 2026-09-02, refined the sendoff in chat after the :5209 widget. The :5209 Shot B card
(compose door behind two chair-stands; 0.40s chorus-line at their chairs) is **stale**. STOP
Shot B. Lock THIS picture:

Two robots in the **center of the circle**, **facing the camera**, **arch in the background**.
Then a **slow sweeping pan** that covers them with the arch, and they **slowly turn around to
face it**. Not a walk to the mansion door. Not the 0.40s chorus-line at their chairs.

He still bought door-in-frame / no walk-to-door. The new bits: center of the ring, face camera
first, arch behind, slow pan, turn to face the arch.

This is a spec camera (slow pan) + a turn anim. Do not invent a chase / top / crane follow.
sitLock / center-of-ring is solved here: execute-hit already drops lock for a walk; this is a
ring-center stand + turn, not a door walk. No new SHOW beat.

Verified on `main` at `a7fc331`:

- The wait is already shipped. `pair-lock-stage.js` `PAIR.STAND_RUNNER 0.00` / `STAND_GUIDE
  0.40` / `SETTLE 2.00` / `FADE 0.25`, `PAIR_LOCK_MS = 2250`. `local.mjs` `startPairLock`
  waits `pairLockMs()` on Casting, then pins expedition. Overlay drops (`onSendoff`). Phones
  stay on Locked. `SHOW_BEATS` has no sendoff. Reactors: none. Key `runner>guide`. **Keep
  all of that class of wait. Replace the PERFORMANCE and the wait duration.**
- Shot B is the current performance: `Sit_to_Stand_Transition_M` under a pinned root,
  sitLock stays on, 0.40s stagger. That is the picture this slice kills.
- Execution already drops sitLock and walks the inner ring (`intro-bed.js` `setExecute` /
  `planExecute`). Copy that drop for the two named bodies, then walk to the ring origin
  `(cx, cz)` — not to a door.
- Ring origin is the same `(cx, cz)` `chair-seats.js` / the bed already use. Radius is
  `seatCircleRadius`. Do not invent a second center.
- The ballroom already has an arch / doorway the dress places (the opening the expedition
  eventually walks through). Use that mark. Do not author a second arch. If the dress mark
  is not named, say so in the report and take the existing doorway the runner leaves by.
- `follow.js` chase / top / crane stay the expedition produced follow. Execution already
  has a spec camera (`execCamMode` / `wreckCam`) that is NOT a `CUE_KINDS` follow mode.
  Sendoff pan is that class: numbers in `pair-lock-stage.js`, bed drives them, no new
  `CUE_KIND`.
- Seated allow-list has no turn-in-place clip. Loco GLB is what execute already walks on.
  Use an existing stand-turn / loco turn if one is already loaded; otherwise yaw the root
  over TURN_DUR. Do not bake, do not fetch, do not add a clip name to
  `SEATED_REACTION_CLIPS` to fake a turn in the chair.

---

## 0. Why this slice exists

PR 67 made the room wait, then stood two chairs. John then locked a different picture: two
bodies in the middle of the ring, visors at the lens, the arch behind them, a slow pan that
puts the arch over them, a slow turn to face it. The wait stays. The chorus-line at the
chairs goes. Overlapping this scene with the expedition is still the same bug as overlapping
noms — `PAIR_LOCK_MS` just gets longer.

---

## 1. File ownership

**You may edit these.** Anything else is another owner's. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-pair-lock-ring.md` | this file |
| `src/game/pair-lock-stage.js` | rewrite `PAIR` / `planPairLock` / `PAIR_LOCK_MS`; add `sendoffCam` + `pairMarks` (THREE-free, same class as `wreckCam`); sitLock drop is a hook the bed calls, not a comment that it stays on |
| `src/game/intro-bed.js` | drive the new plan: drop sitLock on the two named bodies (copy execute), walk to ring origin, hold face-camera, apply `sendoffCam` during the pan, yaw/turn to the arch, rest the guide at FADE. Re-export the new numbers |
| `net/party/local.mjs` | hop already waits `pairLockMs()` — the number grows, the hop does not grow a second timer |
| `harness/pair-lock-stage.mjs` | rewrite P0 / P1 / P3d: kill 0.40 stagger, kill "sitLock stays on", assert ring-center marks, pan `u=0..1`, turn, finished = HOLD+FADE, still no `CUE_KIND`, still no SHOW beat |
| `harness/party-night.mjs` | still waits `PAIR_LOCK_MS + 80` after `t:'episode'` — the import picks up the new number |
| `harness/host-desync.mjs` | same |
| `harness/night-coupling.mjs` | same |
| `harness/room-ghosts.mjs` | same |

**Do not edit:** `follow.js` chase / top / crane / `CUE_KINDS` / `CUE_KEYS.run`. Hunter art.
Expedition pads / auto-walk. PR 66 / 68. Live 5178/5181 checkout. `SHOW_BEATS` /
`episode-order` (no new beat). `accusation-stage.js`. `execute-hit.js` (copy the sitLock
pattern in the bed; do not restyle the hit).

---

## 2. Closed list — this slice does not add a people-scene

The closed list from `task-pair-lock-scene.md` still holds. This is a rewrite of the
**already-built** pair-lock sendoff picture, not a fourth scene. :5209 Shot A (stagger +
job plates) and Shot B (chair-stand door-in-frame) and Shot C (vote huddle) are not this
slice.

---

## 3. Pair-lock sendoff — ring-center (the lock)

### 3.1 When it plays (unchanged)

After the pair is locked (3·2·1 finished, or the 20s ballot backstop resolved a pair),
**before** `setShow('expedition')`. Empty ballot box still waits; this scene never invents a
pair. Key `runner>guide`. Re-cue of the same pair is a no-op. Reactors: **none**.

### 3.2 No new SHOW beat (unchanged)

Sendoff still plays ON Casting after lock. Do not add `sendoff` to `SHOW_BEATS`. Overlay
still drops (`onSendoff`). Phones still stay on Locked / Watch the TV. Ready-up skip does
**not** apply. Sendoff wait does **not** skip, including in the sim.
`CASTING_BACKSTOP_MS` mid-scene still finishes the scene, then expedition.

### 3.3 Killed — Shot B chair-stands

Do not:

- stand them at their chairs for the picture
- stagger guide at `0.40` so it is "not a chorus line"
- keep sitLock on and let `Sit_to_Stand_Transition_M` be the whole scene
- compose the mansion door behind two chair-stands
- walk them to the mansion door (that is the expedition)
- add chase / top / crane, a follow mode, a crane, a last-look box, or a `CUE_KIND`

`Sit_to_Stand_Transition_M` may still fire as the **rise** off the cushion (execute does).
It is not the sendoff.

### 3.4 Performance — ring-center stand + turn

Bodies already on air. No new geometry, no new bake, no cut.

PAIR = {
  RISE:      0.00,   // both named bodies stand. Together is fine — the 0.40 stagger is dead.
  WALK:      1.65,   // sitLock off (execute pattern). Loco toward ring origin.
  ARRIVE:    4.00,   // both on the mark, facing the camera, arch behind.
  PAN:       6.00,   // 2s face-hold so the two visors read, then the slow sweep starts.
  TURN:     10.00,   // pan has covered them with the arch. They turn to face it.
  HOLD:     12.50,   // facing the arch. Then FADE.
  FADE:      0.25,
}

PAIR_LOCK_MS = 12750   // HOLD + FADE. local.mjs already waits this number.

PAIR_MARK = {
  GAP: 0.70,           // metres between the two bodies, tangent to the arch axis
}

clip rise: Sit_to_Stand_Transition_M   // rise only, then loco. Not a held chair-stand.

Finished = HOLD + FADE = 12.75s. `pairLockMs()` must return `PAIR_LOCK_MS`. Pending-empty
at 1.65s is not done.

**sitLock.** Drop it on the runner and the guide at WALK, the same three beats execute
already uses (collider out, copy pos off the sit attach, sitLock = false, play loco).
Do not drop it on the other six. Do not walk to a door.

**Marks.** Ring origin is `(cx, cz)` the bed already has.

pairMarks({ cx, cz, arch, floorY }) -> { runner: {x,z,faceCam,faceArch}, guide: {x,z,...} }

Place them GAP/2 either side of `(cx, cz)` on the tangent of the arch axis so they are a
pair, not stacked. faceCam looks at the lens (away from the arch). faceArch looks at the
arch. Y is standing-on-floor, not chair height.

**Turn.** From faceCam to faceArch over TURN..HOLD (2.50s). Existing stand-turn / loco
turn if the already-loaded GLB has one; otherwise yaw the root. Report which. Do not add a
seated-clip name.

**Rest at FADE.** Guide returns to their chair (sitLock on, seated idle) so the ring is not
left with a leftover stand-in when expedition pins. Runner is holdForRun's job the moment
expedition pins — do not walk them to the door during sendoff, and do not leave them glued
to the mark into the run. Empty setPairLock still rest()s both.

### 3.5 Spec camera — slow pan, not a follow mode

Do not invent a camera class. Do not add a follow mode. Do not put the guide flyover on the
TV. Expedition's produced follow (chase in the ballroom, top over the runner's rooms, crane
between) starts when the sendoff is **finished**, not during it.

The sendoff has one spec camera, same class as wreckCam / execCamMode: THREE-free numbers in
`pair-lock-stage.js`, the bed applies them while Casting is on sendoff.

sendoffCam({ cx, cz, floorY, arch, u }) -> { eye, look }

u = 0 at PAIR.PAN (pair faces camera, arch in the background)
u = 1 at PAIR.TURN (the pan has covered them with the arch)
u is 0 before PAN and 1 after TURN. Ease in/out (smoothstep). No cut.

Lock:

- look is the midpoint of the two marks, visor height 1.16 (living head, not wreck
  WRECK_LOOK_Y).
- u = 0: eye is on the side of the ring **opposite the arch**, ~4.2 m from origin, eye Y
  1.42. Pair faces this lens. Arch is behind them. Door-in-frame is this composition —
  the arch is in frame, they have not walked to it.
- u = 1: eye has swept ~0.90 rad (~52°) around the look-at so the arch slides over /
  covers the pair. Same eye Y. Not a crane (Y does not climb). Not chase (eye does not
  follow a moving runner). Not top (not a plan view).
- Duration of the sweep is TURN - PAN = 4.00s. Slow on purpose.
- Phones stay controllers. No 3D on the phone.

### 3.6 40min bar

~12.75s per episode × EPISODE_CAP is ~64s. Do not touch RECKONING_CAP or sessionSeconds.
round-loop already uses the 90s reckoning wall, not a sendoff number.

---

## 4. Traps

- PR 67 comments say "sitLock stays on" in pair-lock-stage.js and intro-bed.js. Those
  comments are now lies — delete them when the drop exists, or the next reader will "fix"
  the walk back to a pinned stand.
- harness/pair-lock-stage.mjs P0b / P0c / P0e / P3d currently assert Shot B (0.40 stagger,
  SETTLE 2.00, sitLock stays, PAIR_LOCK_MS === 2250). They must move with the plan or
  gates:party stays green on the wrong picture.
- Do not add sendoff to CUE_KINDS to "make the pan a cue". Execution did not do that
  for B / wreck. A follow-mode sendoff is how chase leaks onto Casting.
- Do not restyle holdForRun into a door walk during the scene. Expedition still starts
  the produced follow.
- ui.locked into expedition is still the bug that killed later 3·2·1s. Sendoff is still
  Casting.
- Never npx vite build. Never backticks inside /* glsl */ template literals.
- Do not remount 5178/5181. Do not kill Chrome. Do not edit the live sit-down checkout.
- Do not start Max. Do not dump onto PR 66 / 68. Do not build the stale :5209 Shot B card.

---

## 5. Verification

Node-only. Live table is out.

    npm run gates:party
    node harness/pair-lock-stage.mjs
    node harness/party-night.mjs
    node harness/cast-ballot.mjs
    node harness/accusation-stage.mjs
    node harness/execute-hit.mjs
    node harness/party-follow.mjs

Must go RED if: t:'episode' pins expedition before HOLD+FADE; sim skips the sendoff;
bodies stay at their chairs for the picture (Shot B); sitLock is still on at WALK for the
two named seats; sendoffCam is missing or Y climbs (crane) or a CUE_KIND appeared;
chase / top / crane ran during Casting; a new SHOW_BEATS entry appeared; reactors gasp;
they walk to the door; PR 66 / 68 was used as the branch.

If a stated fact is wrong, say so in the report rather than diverging silently.
