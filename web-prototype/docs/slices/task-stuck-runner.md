# Slice: unstick the expedition runner (CAST9 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `0f9f0a0` (PR 76 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 76 as **failed delivery**, not a new look.

CAST9 (`harness/_loop8/season-cast9.json`, holeIds H382-H403) sat on `0f9f0a0` after 76
claimed the runner unstuck. Still expedition at ~100s then TV `]`. H382 class. Pin must
clock recap. **This is the next hole.** Not a new camera.

Quote CAST9: `THE SEASON IS OVER` / `The Showrunner is deciding.` Evils Fox+Gus OUT.
No W5. No 2g1e. Outcome REUNION, rule W1 both evils dead.

CAST9 lock `pinClocksRecap` = FAIL (skip true — do not licensed-skip):

- quote: `PRIME TIME ON AIR EPISODE 5 · EXPEDITION` Hal is running Hal walks. Gus talks.
  The house can hear a drill.
- Ep 1-5 `cameraQuote` all include `] BEAT`.
- Wait natural recap <=100s. Host `]` is not a product walk.

76 already shipped `unstickLegs` / stall replan in `runner-intel.js` and recap-clock
comments in `follow-bed.js`. CAST9 still froze. The defect is pin arrival never clocks
expedition to recap, not a missing stall trigger.

Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera install,
not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D / TV E.

---

## 0. Why this slice exists

A pinned runner who does not arrive never mounts the camera. CAST9 then sat on expedition
chrome until ~100s and the host cut with `]`. 76 shipped an unstick claim; CAST9 failed
it the same way CAST8 did (H358 then H382). Next: pin clocks recap without `]`.

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/game/runner-intel.js` | stall replan must not re-issue the same blocked leg; keep stallSec 2.0 / stallGain 0.75 unless a measured fact is wrong |
| `src/game/follow-bed.js` | drive the unstick from where she stands. When the pin walk / job finishes, **clock expedition to recap**. No authored waypoint list. Do not walk the true camera |
| `src/party/objectives.js` | only if objectiveGoal hands a non-walkable point |
| `harness/runner-intel.mjs` | CAST9-class 100s freeze plus host `]` is red; new legs are not the blocked identity; body gains stallGain toward the pin |
| `harness/expedition-spec.mjs` | only if the paper would claim a walk the code no longer does |

**Do not edit:** `follow.js` CUE_KINDS / chase / top / crane / liveRunShot. Hunter art.
phases.js expedition ceiling. Live 5178/5181. `win.js`. Execute / wreck / emote / vote
chrome (other slices). Do not restore W5.

---

## 2. The lock

1. The runner auto-walks the current guide pin (door, painting, or camera install).
2. If the body stalls (stallSec at less than stallGain), replan from here, not the last
   failed portal. The new first leg must not be the same (x, z, roomId) that just failed.
3. Furniture / doorframe snags are a replan, not a sit. HOLD-to-hide stays; releasing
   resumes the pin.
4. Evil sabotage stays job fumbles, not a freeze of the walk.
5. **Pin clocks recap.** Expedition chrome may only hold for a walking or hidden body,
   or a finished / failed job. A wedged body is a defect. Host `]` is not a product walk.
   The expedition wall is still the ceiling if nobody pins.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.

---

## 3. Traps

- A stall trigger that replans onto the same portal is a green RI1 and a stuck CAST night.
- 76's `unstickLegs` plus recap-clock comments are not a pass. CAST9 `pinClocksRecap`
  FAIL is the bar.
- Auto-walking the true camera install is the lie the twins exist to protect. Walk the
  pin the guide tapped.
- Do not restore forward drive on the stick. Lateral dodge only.
- Do not licensed-skip halls (`pinClocksRecap.skip` was true on CAST9). Quote chrome.
- Never npx vite build.

---

## 4. Verification

Gate: `harness/runner-intel.mjs` in `gates:party`, plus a CAST9-class executed negative
(100s freeze / host `]` / `pinClocksRecap` FAIL).
Red: stall replan returns the blocked leg; body sits stallSec*3 without stallGain toward
the pin; expedition never clocks to recap without `]`; a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
