# Slice: unstick the expedition runner (CAST8 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `ec50862` (PR 74 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 74 as **failed delivery**, not a new look.

CAST8 (`harness/_loop8/season-cast8.json`, holeIds H358-H380; CoS last H381) sat on
`ec50862` after 74 claimed the runner unstuck. Every expedition froze ~100s then host
timeout (H358 class). Quote CAST8: "The cast wins. The Reunion is next." W5 stays gone.
2g1e last vote stays. Do not invent a camera.

CAST8 receipt (ep 5 H378, same class as H358 every episode):

- saw: Auto-walk/sendoff did not leave expedition in 100s. pair=Gus/Ben beat=expedition
  warmPct=100 body includes PRIME TIME ON AIR EPISODE 5 · EXPEDITION, CAMERAS 1 / 4,
  host ] later.
- expected: After 3·2·1 + ring-center sendoff the pair auto-walks to the pinned door
  and the beat leaves expedition without TV ].
- so: Sendoff/auto-walk did not complete the run beat. Last-resort TV ] is not a
  product walk.
- next: Quote chrome. Do not licensed-skip. Fix auto-walk to pin.

Wait natural recap ≤100s. No licensed skip. `SECONDS[EXPEDITION]` is still the ceiling,
not the designed end of a stuck walk.

Verified on `ec50862` (74 already shipped constants; CAST8 still froze):

- `src/party/phases.js` — expedition clock is the ceiling.
- `src/party/follow.js` — pin is on the wire (`PIN_WIRE_KEYS`, `PIN_KINDS` includes
  `OBJECTIVE_KINDS`). Auto-walk is the move model. Stick is lateral dodge only. TV is
  produced follow. `CUE_KINDS` already has pin / run / execute. Do not add another.
- `src/game/runner-intel.js` — `AUTOWALK.stallGain = 0.75`, `stallSec = 2.0`.
  `REPLAN_TRIGGERS = pin, phase, legs, stall`. `pin` outranks `stall`.
- `harness/runner-intel.mjs` — RI1 / RI1b / RI1c already hold those numbers. A stall
  replan that returns the same blocked portal still leaves the body wedged. CAST8 is
  that class, plus the beat never clocks to recap.
- Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera
  install, not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D /
  TV E. Thumb does not pick the painting.

---

## 0. Why this slice exists

A pinned runner who does not arrive never mounts the camera. CAST8 then sat on
expedition chrome until ~100s and the host cut with ]. That is a pathing bug wearing
a show clock. 74 shipped an unstick claim; CAST8 failed it. Do not add a camera to
paper over a body that is not walking.

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/game/runner-intel.js` | stall replan must not re-issue the same blocked leg; keep stallSec/stallGain unless a measured fact is wrong |
| `src/game/follow-bed.js` | drive the unstick. Live pathPortals from where she stands. No authored waypoint list. Clock expedition to recap when the walk/job finishes. Do not walk the true camera |
| `src/party/objectives.js` | only if objectiveGoal hands a non-walkable point |
| `harness/runner-intel.mjs` | executed unstick: new legs are not the blocked identity; body gains stallGain toward the pin; CAST8-class 100s freeze plus host ] is red |
| `harness/expedition-spec.mjs` | only if the paper would claim a walk the code no longer does |

**Do not edit:** `follow.js` CUE_KINDS / chase / top / crane / liveRunShot. Hunter art.
phases.js expedition ceiling. Live 5178/5181. win.js. Execute / wreck / emote / vote
chrome (other slices in this PR). Do not restore W5.

---

## 2. The lock

1. The runner auto-walks the current guide pin (door, painting, or camera install).
2. If the body stalls (stallSec at less than stallGain), replan from here, not the last
   failed portal. The new first leg must not be the same (x, z, roomId) that just failed.
3. Furniture / doorframe snags are a replan, not a sit. HOLD-to-hide stays; releasing
   resumes the pin.
4. Evil sabotage stays job fumbles, not a freeze of the walk (SABOTAGE list stays).
5. Auto-walk / pin path **must clock expedition to recap**. Expedition chrome may only
   hold for a walking or hidden body, or a finished / failed job. A wedged body is a
   defect. Host ] is not a product walk. The expedition wall is still the ceiling if
   nobody pins.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.

---

## 3. Traps

- A stall trigger that replans onto the same portal is a green RI1 and a stuck CAST night.
- Auto-walking the true camera install is the lie the twins exist to protect. Walk the pin
  the guide tapped.
- Do not restore forward drive on the stick. Lateral dodge only.
- Do not licensed-skip halls to hide a freeze. Quote chrome.
- Never npx vite build.

---

## 4. Verification

Gate: `harness/runner-intel.mjs` in `gates:party`, plus a CAST8-class executed negative
(100s freeze / host ]).
Red: stall replan returns the blocked leg; body sits stallSec*3 without stallGain toward
the pin; expedition never clocks to recap without ]; a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
