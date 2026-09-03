# Slice: populate pin[] so recap clocks without ] (CAST13 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `87d45d5` (PR 84 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 84 as **failed delivery of pin[] clock**, not a new look.

CAST13 (`harness/_loop8/season-cast13.json`, holeIds H514-H561). `pinPad=true` PARTIAL
PASS held (1921 ticks, no mid-walk regression). **Do not undo pinPad=true.** `pin=[]`
empty all night; TV `]` at 100s. H514 (CAST12 H484 class). Populate `pin[]` so recap
clocks without `]`. Not a new camera. **This is the next hole.**

2g1e last vote PASS (piled remaining evil Cy). No W5. Vote-HIT mixed, not this build.
Emote plate regression is a separate slice.

Quote CAST13: `SEASON FINALE` / `The cast wins` / reunion `Ada EDITOR SURVIVED THE CAST`
`Ben PLANT EXECUTED PRODUCTION` `Dee CONTINUITY SURVIVED` `Cy PRODUCER EXECUTED`.
Evils Ben+Cy. Past ep5 to ep11.

CAST13 lock `pinClocksRecap` = FAIL (skip true — do not licensed-skip):

- quote: `PRIME TIME ON AIR EPISODE 8 · EXPEDITION` Cy is running Cy walks. Dee talks.
- H559: Auto-walk/sendoff did not leave expedition in 100s. pair=Cy/Dee warmPct=100.
- H514 class: `pin=[]` empty all night; still TV `]` at 100s. pinPad stayed true.
- Wait natural recap <=100s. Host `]` is not a product walk.

84 clocked taps into `pin[]` in node. CAST13 still photographed an empty `pin[]` all
night. The painted pad is live; the clock is not. Populate `pin[]`. Do not paint a
second pad.

Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera
install, not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D /
TV E.

---

## 0. Why this slice exists

A painted pad with an empty `pin[]` is a dead map. 84 shipped a clock claim; CAST13
failed it the same way CAST12 did (H484 then H514). Recap without `]` needs `pin[]`
to hold the door / painting / camera-install the guide tapped.

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/views/party-phone.js` | each guide tap (and the wire pin) must land in `pin[]` that AUTO-WALK tick; keep painted `pinPad=true` |
| `src/game/follow-bed.js` | auto-walk the clocked `pin[]`; clock expedition to recap when walk/job finishes |
| `src/game/runner-intel.js` | stallSec 2.0 / stallGain 0.75 stay; do not drop the pin mid-walk |
| `harness/runner-intel.mjs` | CAST13-class `pinPad=true` + `pin[]` empty all night + 100s `]` is red |

**Do not edit:** `follow.js` CUE_KINDS. Hunter art. Live 5178/5181. `win.js` (2g1e / W1
PASS; do not restore W5). Execute linger (other slice). Emote chrome (other slice).
Vote-HIT (mixed). Do not revert pinPad paint.

---

## 2. The lock

1. Keep `pinPad=true` on expedition. CAST13 held it 1921 ticks. Do not undo it.
2. Populate `pin[]` from the painted pad. A tap on a door / painting / camera-install
   must land in `pin[]` that AUTO-WALK tick. `pin[]` empty all night is a defect.
3. The runner auto-walks that pin. Stall replan must not re-issue the same blocked leg.
4. **Pin clocks recap.** When the walk / job finishes, expedition leaves without TV `]`.
5. HOLD-to-hide stays; releasing resumes the pin. Evil sabotage stays job fumbles.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.
7. Do not licensed-skip (`pinClocksRecap.skip` was true on CAST13).

---

## 3. Traps

- `pinPad=true` with `pin=[]` is CAST13, not a pass. Quote `pin[]` every AUTO-WALK tick.
- 84's pin[] clock in node is not this bar. H514 / H559 is the bar.
- Auto-walking the true camera install is the lie the twins exist to protect.
- Do not restore forward drive on the stick. Never npx vite build.

---

## 4. Verification

Gate: `harness/runner-intel.mjs` in `gates:party`, plus a CAST13-class executed negative
(`pinPad=true` and `pin[]` empty all night / 100s freeze / host `]`).
Red: `pin[]` empty on AUTO-WALK ticks; painted `pinPad` flipped back to false;
expedition never clocks to recap without `]`; a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
