# Slice: paint guide pinPad and clock pin[] (CAST11 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: CAST11 sat `8c14863` (PR 80). Docs PR off current `main` (`2012a61` = 80 + Production
flag). Spec, not the night. **Grok, not Max. Do not merge.** Game waits on this docs PR.
Treat PR 80 as **failed delivery of pin**, not a new look.

CAST11 (`harness/_loop8/season-cast11.json`, holeIds H447-H483). `pinPad=false` `pin=[]`
every AUTO-WALK tick; still `]` at ~100s. H447 class. **Paint guide pinPad and clock
pin[] so recap happens without `]`.** Not a new camera. **This is the next hole.**

2g1e last vote PASS (goods piled remaining evil Cy → W1). No W5. Emote chrome PASS —
do not touch. Vote-HIT mixed, not this build.

Quote CAST11: `SEASON FINALE` / `The cast wins`. Evils Cy+Eli OUT. Living Ada, Dee.
Past ep5 (ep7). Rule: `W1 — both evils dead. The cast wins 0 cameras is NOT a miss when W1.`

CAST11 lock `pinClocksRecap` = FAIL (skip true — do not licensed-skip):

- quote: `PRIME TIME ON AIR EPISODE 6 · EXPEDITION` Dee is running Dee walks. Ada talks.
- H480: `pinPad=false pin=[] all night`. pair=Dee/Ada leftBeat=false recapNow=false.
  Expected: guide pinPad paints and pin[] clocks a door. Expedition clocks to recap
  when walk/job finishes. `pinPad` must not stay false. `pin=[]` all night is FAIL.
- H481: Auto-walk/sendoff did not leave expedition in 100s. warmPct=100. Host `]` is
  not a product walk.
- Wait natural recap <=100s.

80 shipped `pinClocksRecap()` / `pinPadLive()` in `runner-intel.js` and a bed call with
`hasScope: true`. CAST11 still photographed a dead pad (`pinPad=false`) and an empty
`pin[]` on every AUTO-WALK tick. The painted guide pad is the hole, not another
function name.

Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera
install, not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D /
TV E.

---

## 0. Why this slice exists

No pin pad means auto-walk cannot clock recap without TV `]`. 80 shipped a clock
claim; CAST11 failed it because the guide never got a live pinPad / pin[].

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/game/runner-intel.js` | keep stallSec 2.0 / stallGain 0.75; `pinPadLive` must match the painted pad, not a hardcoded true |
| `src/game/follow-bed.js` | clock expedition to recap when pin walk / job finishes; do not drop the pin mid-walk |
| the guide phone pad that paints `pinPad` / `pin[]` (party phone / guide E pad) | **paint** `pinPad` and clock `pin[]` every AUTO-WALK tick. CAST11 `pinPad=false pin=[]` is red |
| `harness/runner-intel.mjs` | CAST11-class `pinPad=false pin=[]` all night plus 100s `]` is red |

**Do not edit:** `follow.js` CUE_KINDS / chase / top / crane / liveRunShot. Hunter art.
Live 5178/5181. `win.js` (W1 / 2g1e already PASS; do not restore W5). Execute linger
(other slice). Emote chrome (PASS). Vote-HIT (mixed).

---

## 2. The lock

1. The guide pinPad paints on expedition. `pinPad=false` all night is a defect.
2. `pin[]` clocks the door / painting / camera-install the guide tapped. `pin=[]` every
   AUTO-WALK tick is a defect.
3. The runner auto-walks that pin. Stall replan must not re-issue the same blocked leg.
4. **Pin clocks recap.** When the walk / job finishes, expedition leaves without TV `]`.
5. HOLD-to-hide stays; releasing resumes the pin. Evil sabotage stays job fumbles.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.
7. Do not licensed-skip (`pinClocksRecap.skip` was true on CAST11).

---

## 3. Traps

- `pinPadLive({ hasScope: true }) === true` in a harness is not a pass if the painted
  pad is false. Quote `pinPad` / `pin[]` every AUTO-WALK tick.
- 80's RI26 is not a pass. CAST11 H480 / H481 is the bar.
- Auto-walking the true camera install is the lie the twins exist to protect.
- Do not restore forward drive on the stick. Never npx vite build.

---

## 4. Verification

Gate: `harness/runner-intel.mjs` in `gates:party`, plus a CAST11-class executed negative
(`pinPad=false pin=[]` all night / 100s freeze / host `]`).
Red: painted guide `pinPad` false; `pin[]` empty on AUTO-WALK ticks; expedition never
clocks to recap without `]`; a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
