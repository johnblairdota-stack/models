# Slice: pin clocks recap (CAST10 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `381ae40` (PR 78 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 78 as **failed delivery of pin**, not a new look.

CAST10 (`harness/_loop8/season-cast10.json`, holeIds H404-H446) sat on `381ae40` after 78
shipped `pinClocksRecap()`. Still expedition ~100s then TV `]`. `pinPad=false`. H404 class.
**This is the next hole.** Pin must clock recap. Not a new camera.

Do not reslice emote chrome (`fadingPopups` PASS). Vote-HIT stays mixed, not this build.

Quote CAST10: `CANCELLED` / `Production wins` / reunion `CANCELLED ROLL CALL` …
`The cast Cy PRODUCER · SURVIVED PRODUCTION`. Evils Cy+Dee still living. 3g2e. Past ep5
(ep6–8). No 2g1e. Not W4. W5 stays deleted. Do not invent a SHOW beat.

CAST10 lock `pinClocksRecap` = FAIL (skip true — do not licensed-skip):

- quote: `PRIME TIME ON AIR EPISODE 6 · EXPEDITION` Hal is running Hal walks. Cy talks.
  The house can hear a drill.
- H442: Auto-walk/sendoff did not leave expedition in 100s. pair=Hal/Cy warmPct=100.
  Expected: after 3·2·1 + ring-center sendoff the pair auto-walks to the pinned door and
  the beat leaves expedition without TV `]`.
- Ep 1, 2, 4, 5, 6, 8 `cameraQuote` include `] BEAT`.
- H443 sels include `pinPad=false` (guide pin pad dead while the walk is wedged).
- Wait natural recap <=100s. Host `]` is not a product walk.

78 already shipped `pinClocksRecap()` and RI25. CAST10 still froze. The defect is pin
arrival / pin pad still not clocking expedition to recap, not a missing function name.

Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera install,
not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D / TV E.

---

## 0. Why this slice exists

A pinned runner who does not arrive never mounts the camera. CAST10 sat on expedition
chrome until ~100s and the host cut with `]`, with `pinPad=false`. 78 shipped a clock
claim; CAST10 failed it the same way CAST8/CAST9 did (H358, H382, now H404/H442).

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/game/runner-intel.js` | stall replan must not re-issue the same blocked leg; keep stallSec 2.0 / stallGain 0.75 unless a measured fact is wrong |
| `src/game/follow-bed.js` | drive the unstick from where she stands. When the pin walk / job finishes, **clock expedition to recap**. `pinPad` must stay live on the guide. No authored waypoint list. Do not walk the true camera |
| `src/party/objectives.js` | only if objectiveGoal hands a non-walkable point |
| `harness/runner-intel.mjs` | CAST10-class 100s freeze plus host `]` plus `pinPad=false` is red; `pinClocksRecap` FAIL is red |

**Do not edit:** `follow.js` CUE_KINDS / chase / top / crane / liveRunShot. Hunter art.
phases.js expedition ceiling. Live 5178/5181. `win.js` (see the cancelled-not-w5 flag
slice if you touch a leftover Production fold). Execute linger (other slice). Emote
chrome (PASS — do not touch). Vote-HIT (mixed, not this build). Do not restore W5.

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
   `pinPad=false` during the walk is a defect.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.

---

## 3. Traps

- 78's `pinClocksRecap()` plus RI25 is not a pass. CAST10 `pinClocksRecap` FAIL is the bar.
- Do not licensed-skip halls (`pinClocksRecap.skip` was true on CAST10). Quote chrome.
- Auto-walking the true camera install is the lie the twins exist to protect.
- Do not restore forward drive on the stick. Lateral dodge only.
- Never npx vite build.

---

## 4. Verification

Gate: `harness/runner-intel.mjs` in `gates:party`, plus a CAST10-class executed negative
(100s freeze / host `]` / `pinPad=false` / `pinClocksRecap` FAIL).
Red: stall replan returns the blocked leg; expedition never clocks to recap without `]`;
guide `pinPad` is false while the runner is on the pin path; a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
