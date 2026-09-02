# Slice: unstick the expedition runner (auto-walk / pin path)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `aed49a5` (PR 72 THE LOOP). Spec, not the night. **Do not invent a camera.**
Do not merge. Do not start Max. Still Grok. Game builds after this PR.

John watched CAST 8-bot on this tip. Expedition: the runner gets stuck. TV and phones stay on
that chrome until the 90s expedition clock times out into debrief (CAST7: ~90s pin then host ]).
Fix the stuck body (auto-walk / pin path). Not a new camera, not a new follow mode, not a TV map.
This is the top product hole of the CAST 8-bot night.

Verified on `aed49a5`:

- `src/party/phases.js` — `SECONDS[PHASE.EXPEDITION] = 90`. Timeout to debrief is the
  ceiling, not the designed end of a stuck walk.
- `src/party/follow.js` — pin is on the wire (`PIN_WIRE_KEYS`, `PIN_KINDS` includes
  `OBJECTIVE_KINDS`). Auto-walk is the move model. Stick is lateral dodge only. TV is
  produced follow. `CUE_KINDS` already has `pin` / `run` / `execute`. Do not add another.
- `src/game/runner-intel.js` — `AUTOWALK.stallGain = 0.75`, `stallSec = 2.0`.
  `REPLAN_TRIGGERS = pin, phase, legs, stall`. `pin` outranks `stall`. `pinKey` identity
  is x, z, roomId, kind to two decimals. Legs come from a live `pathPortals` answer.
- `harness/runner-intel.mjs` — RI1 / RI1b / RI1c already hold those numbers. A stall
  replan that returns the same blocked portal still leaves the body wedged; the live
  CAST stuck is that class of defect, not a missing trigger.
- `harness/expedition-spec.mjs` — ES1-ES5 already claim auto-walk plus objective pins.
  Do not rewrite the sofa lock. Unstick the walker.
- Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera
  install, not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D /
  TV E. Thumb does not pick the painting.
# Slice: unstick the expedition runner (auto-walk / pin path)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `aed49a5`. Spec, not the night. Do not invent a camera. Do not merge.
Do not start Max. Still Grok. Game builds this after. Paths under `web-prototype/`.

John watched CAST 8-bot on `aed49a5`. Expedition runner gets stuck. TV/phones stay on that
chrome until the 90s expedition clock times out to debrief. Fix stuck runner (auto-walk /
pin path). NOT a new camera.

Verified on `aed49a5`:

- `src/party/phases.js` — `SECONDS[EXPEDITION] = 90`. Timeout is the ceiling, not the
  designed end of a stuck walk.
- `src/party/follow.js` — pin is on the wire (`PIN_WIRE_KEYS`, `PIN_KINDS` includes
  `OBJECTIVE_KINDS`). Auto-walk is the move model. Stick is lateral dodge only. TV is
  produced follow. `CUE_KINDS` already has pin/run/execute. Do not add another.

---

## 0. Why this slice exists

A pinned runner who does not arrive never mounts the camera. The table then sits on expedition chrome until the 90s wall. That is a pathing bug wearing a show clock. Do not add a camera to paper over a body that is not walking.

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/game/runner-intel.js` | unstick: stall replan must not re-issue the same blocked leg; keep stallSec/stallGain unless a measured fact is wrong |
| `src/game/follow-bed.js` | drive the unstick. Live pathPortals from where she stands. No authored waypoint list (D4). Do not walk the true camera |
| `src/party/objectives.js` | only if objectiveGoal hands a non-walkable point |
| `harness/runner-intel.mjs` | executed unstick: new legs are not the blocked identity; body gains stallGain toward the pin |
| `harness/expedition-spec.mjs` | only if the paper would claim a walk the code no longer does |

**Do not edit:** `follow.js` CUE_KINDS / chase / top / crane / liveRunShot. Hunter art. phases.js 90s ceiling. Live 5178/5181. win.js. Execute / wreck / emote / vote chrome (other slices in this PR).

---

## 2. The lock

1. The runner auto-walks the current guide pin (door, painting, or camera install).
2. If the body stalls (stallSec at less than stallGain), replan from here, not the last failed portal. The new first leg must not be the same (x, z, roomId) that just failed.
3. Furniture / doorframe snags are a replan, not a sit. HOLD-to-hide stays; releasing resumes the pin.
4. Evil sabotage stays job fumbles, not a freeze of the walk (SABOTAGE list stays).
5. Expedition chrome may only hold for a walking or hidden body, or a finished / failed job. A wedged body is a defect. The 90s wall is still the ceiling if nobody pins.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.

---

## 3. Traps

- A stall trigger that replans onto the same portal is a green RI1 and a stuck CAST night.
- Auto-walking the true camera install is the lie the twins exist to protect. Walk the pin the guide tapped.
- Do not restore forward drive on the stick. Lateral dodge only.
- Never npx vite build.

---

## 4. Verification
Gate: harness/runner-intel.mjs in gates:party.
Red: stall replan returns the blocked leg, or the body sits stallSec*3 without stallGain toward the pin, or a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
