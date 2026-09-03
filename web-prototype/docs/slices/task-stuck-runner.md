# Slice: clock pin[] on the painted pinPad (CAST12 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `5c9e57c` (PR 82 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 82 as **failed delivery of pin[] clock**, not a new look.

CAST12 (`harness/_loop8/season-cast12.json`, holeIds H484-H513). pinPad paint is a
**PARTIAL PASS** (`pinPad=true`; CAST11 `pinPad=false` class gone). **Do not undo
pinPad=true.** `pin[]` empty all night; still TV `]` at ~100s. H484. Clock `pin[]` on
the painted pinPad so recap happens without `]`. Not a new camera. **This is the next hole.**

2g1e last vote PASS (piled remaining evil Dee → W1). No W5. Emote chrome PASS — do not
touch. Vote-HIT mixed, not this build.

Quote CAST12: `REUNION` / `THE SEASON IS OVER THE AWARDS THE ROLL CALL`. W1 both evils
dead (Dee+Eli). Living Ada, Cy. Past ep5.

CAST12 lock `pinClocksRecap` = FAIL (skip true — do not licensed-skip):

- quote: `PRIME TIME ON AIR EPISODE 6 · EXPEDITION` Dee is running Dee walks. Ada talks.
- CoS / H484: `pin[]` empty all night; still TV `]` at ~100s. pinPad stayed true.
- Wait natural recap <=100s. Host `]` is not a product walk.

82 painted the pin-pad shell and quoted `pinPad` on `__rrrPhone`. CAST12 still never
clocked a tap into `pin[]`, so auto-walk had nothing to walk and the host cut with `]`.
The next hole is the clock, not another paint.

Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera
install, not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D /
TV E.

---

## 0. Why this slice exists

A painted pad with an empty `pin[]` is a dead map. 82 shipped pinPad=true; CAST12
failed the clock. Recap without `]` needs `pin[]` to hold the door / painting /
camera-install the guide tapped.

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/views/party-phone.js` | clock each guide tap into `pin[]`; keep painted `pinPad=true`; D2 still one product slot |
| `src/game/follow-bed.js` | auto-walk the clocked `pin[]`; clock expedition to recap when walk/job finishes |
| `src/game/runner-intel.js` | stallSec 2.0 / stallGain 0.75 stay; do not drop the pin mid-walk |
| `harness/runner-intel.mjs` | CAST12-class `pinPad=true` + `pin[]` empty all night + 100s `]` is red |

**Do not edit:** `follow.js` CUE_KINDS. Hunter art. Live 5178/5181. `win.js` (W1 / 2g1e
PASS; do not restore W5). Execute linger (other slice). Emote chrome (PASS). Vote-HIT
(mixed). Do not revert pinPad paint.

---

## 2. The lock

1. Keep `pinPad=true` on expedition. CAST11 `pinPad=false` is gone. Do not undo it.
2. Clock `pin[]` from the painted pad. A tap on a door / painting / camera-install
   must land in `pin[]` that AUTO-WALK tick. `pin[]` empty all night is a defect.
3. The runner auto-walks that pin. Stall replan must not re-issue the same blocked leg.
4. **Pin clocks recap.** When the walk / job finishes, expedition leaves without TV `]`.
5. HOLD-to-hide stays; releasing resumes the pin. Evil sabotage stays job fumbles.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.
7. Do not licensed-skip (`pinClocksRecap.skip` was true on CAST12).

---

## 3. Traps

- `pinPad=true` with `pin=[]` is CAST12, not a pass. Quote `pin[]` every AUTO-WALK tick.
- 82's RI27 pinPad paint is not this bar. H484 is the bar.
- Auto-walking the true camera install is the lie the twins exist to protect.
- Do not restore forward drive on the stick. Never npx vite build.

---

## 4. Verification

Gate: `harness/runner-intel.mjs` in `gates:party`, plus a CAST12-class executed negative
(`pinPad=true` and `pin[]` empty all night / 100s freeze / host `]`).
Red: `pin[]` empty on AUTO-WALK ticks; painted `pinPad` flipped back to false;
expedition never clocks to recap without `]`; a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
