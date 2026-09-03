# Slice: pin[] must paint; auto-walk clocks recap without ] (CAST14 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `b952d4b` (PR 86 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 86 as **failed delivery of pin[] clock**, not a new look.

CAST14 (`harness/_loop8/season-cast14.json`, holeIds H562-H597). `pinPad=true` stayed.
**Do not undo pinPad=true.** Emote chrome PASS this night — do not touch. 2g1e last vote
PASS (piled remaining evil Dee). No W5. Vote-HIT mixed, not this build.

Quote CAST14: `SEASON FINALE` / `The cast wins`. Evils Dee+Gus. Past ep5 (ep6–8).
`CAMERA WARMING` / `0 of 4` scorekeeping. 0 cameras is not a miss when W1. Do not restore W5.

**This is the next hole.** `pin[]` must paint and the pair auto-walk must clock recap
without TV `]`. Not a new camera.

CAST14 lock `pinClocksRecap` = FAIL (skip true — do not licensed-skip):

- Quote: `AUTO-WALK t=99.9s beat=expedition pinPad=true pin=[]` then LOCK pin→recap FAIL
  used TV `]` last resort. H562 / CAST13 H514 class.
- Lock quote: `PRIME TIME ON AIR EPISODE 7 · EXPEDITION` Dee is running Dee walks. Ada talks.
- H595: Auto-walk/sendoff did not leave expedition in 100s. pair=Dee/Ada warmPct=100.
- Wait natural recap <=100s. Host `]` is not a product walk.

86 claimed `pin[]` across sendoff. CAST14 still photographed `pin=[]` at t=99.9s with
the pad live. Populate `pin[]` on the painted pad and make auto-walk finish the beat.
Do not paint a second pad.

Sofa lock (do not reopen): auto-walk the guide pin; pin paintings and the camera
install, not just doors; stick = dodge/hide; hunter is a door; Guide E / Runner D /
TV E.

---

## 0. Why this slice exists

A painted pad with an empty `pin[]` is a dead map. 86 shipped a sendoff-clock claim;
CAST14 failed it the same way CAST12/13 did (H484, H514, now H562). Recap without `]`
needs `pin[]` to hold the door / painting / camera-install the guide tapped, and the
runner to walk it.

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-stuck-runner.md` | this file |
| `src/views/party-phone.js` | each guide tap (and the wire pin) must land in `pin[]` that AUTO-WALK tick; keep painted `pinPad=true` |
| `src/game/follow-bed.js` | auto-walk the clocked `pin[]`; clock expedition to recap when walk/job finishes; sendoff must not wipe `pin[]` |
| `src/game/runner-intel.js` | stallSec 2.0 / stallGain 0.75 stay; do not drop the pin mid-walk |
| `harness/runner-intel.mjs` | CAST14-class `AUTO-WALK t=99.9s pinPad=true pin=[]` then TV `]` is red |

**Do not edit:** `follow.js` CUE_KINDS. Hunter art. Live 5178/5181. `win.js` (2g1e / W1
PASS; do not restore W5). Execute linger (other slice). Emote chrome (PASS). Vote-HIT
(mixed). Do not revert pinPad paint.

---

## 2. The lock

1. Keep `pinPad=true` on expedition. Do not undo it.
2. `pin[]` must paint. A tap on a door / painting / camera-install must land in `pin[]`
   that AUTO-WALK tick. `pin=[]` at t=99.9s is a defect.
3. The pair auto-walks that pin. Stall replan must not re-issue the same blocked leg.
4. **Pin clocks recap.** When the walk / job finishes, expedition leaves without TV `]`.
   Last-resort `]` is not a product walk.
5. HOLD-to-hide stays; releasing resumes the pin. Evil sabotage stays job fumbles.
6. **Not a new camera.** Do not add a CUE_KIND. Do not put a map on the TV.
7. Do not licensed-skip (`pinClocksRecap.skip` was true on CAST14).

---

## 3. Traps

- `pinPad=true` with `pin=[]` is CAST14, not a pass. Quote AUTO-WALK ticks.
- 86's sendoff pin[] in node is not this bar. H562 / H595 is the bar.
- Auto-walking the true camera install is the lie the twins exist to protect.
- Do not restore forward drive on the stick. Never npx vite build.

---

## 4. Verification

Gate: `harness/runner-intel.mjs` in `gates:party`, plus a CAST14-class executed negative
(`pinPad=true pin=[]` at ~100s / host `]`).
Red: `pin[]` empty on AUTO-WALK ticks; painted `pinPad` flipped back to false;
expedition never clocks to recap without `]`; a new CUE_KIND appeared.
Done is that gate, not a screenshot of an unstuck night.
If a stated fact is wrong, say so in the report rather than diverging silently.
