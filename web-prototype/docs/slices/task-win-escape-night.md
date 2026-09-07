# Slice: escape night replaces W1-W4 (HARD SPEC LOCK 2026-09-08)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

**HARD LOCK from John 2026-09-08. Supersedes every prior win/fold lock** (including W5
deleted, H278 overruled, 2g1e last vote, cameras-lit FINALE, Production at evil>=good,
task-win-cancelled-not-w5.md, task-win-w4.md, and CAST quotes that printed SEASON FINALE
/ The cast wins from W1).

Base: current `main` tip in `web-prototype`. Spec, not the night. **Grok, not Max. Do
not merge.** Game waits on this docs PR.

LHL reference boards (sandbox, not the tree):
`C:\Users\John\Documents\Codex\2026-09-06\` (brief + Last House Live prototype).

---

## 0. Why this slice exists

The night no longer ends on find-the-evil / cameras / Production folds. It ends on
**escape**: goods try to get out; hidden saboteurs block while failures look accidental.
`win.js` still folds W1/W3/W2/W4. That machine is dead product.

---

## 1. Killed (do not keep)

1. **Cameras-as-info as a win/score path.** Lighting cameras must not fire a cast win.
   Missing cameras must not fire Production. `WIN_TARGETS.cameraTarget` and W2 are gone
   as win rules. Camera chrome may still exist as spectacle; it is not the score.
2. **W1–W4 find-the-evil / Production endings.** Delete `TICK_ORDER = W1, W3, W2, W4`
   as the night ender. No more `alive(evil)===0` FINALE, `fed >= feedTarget` CANCELLED,
   `camerasLit >= cameraTarget` FINALE, or `alive(evil) >= alive(good)` CANCELLED as
   season endings.
3. **2 good vs 1 evil last-vote ending.** Do not special-case 2g1e. KEEP/EXPEL between
   jobs is not a season-ending lynch clock.

Host skip / abandoned may remain a non-side outcome if the table already has it. Do not
restore W5 or end-on-camera-miss.

---

## 2. Adopted win / fold

1. **Goods win when at least one good escapes.** Chrome: escape / the cast gets out
   (pick one line; TV and phone share it via one `outcomeLine`).
2. **Saboteurs win when nobody good escapes** (block holds; night ends without a good
   crossing). Chrome: saboteurs hold the house / escape fails — not "Production wins"
   from cameras or count.
3. Allegiance stays hidden until the end reveal (LHL). Expelling all saboteurs does
   **not** end the hunter or the escape — KEEP/EXPEL is mid-night, not the finale.
4. Fold over the log by **escape / block events**, not by camera tally or living-evil
   count. Same-tick precedence lives in one place next to the new rules (replace
   `TICK_ORDER`; do not leave the old W keys as dead aliases that still fire).
5. `RENEWED` / mid-night continue may still mean "another expedition" if the table
   needs it. It must not mean "cameras short so Casting is next" as a win fold.

---

## 3. File ownership

**You may edit these.** Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-win-escape-night.md` | this file |
| `src/party/win.js` | replace fold: escape/block outcomes; kill cameraTarget/W2 and W1/W3/W4 as endings; new `outcomeLine` copy; one precedence table |
| `docs/design/rrr-social-round.md` §6 (if present) | match the lock; strike cameras-as-score and W1–W4 |
| win / episode-order harness already in `gates:party` | old W1/W2/W3/W4 and 2g1e endings are red; escape ≥1 good PASS; no-good-escape saboteur PASS |

**Do not edit:** follow cameras as spectacle plumbing unless a win fire remains.
Expedition pin[] / guide-runner (HOLD — separate). Emote chrome. Live 5178/5181.
Assimilation mesh (other slice). Do not invent a SHOW beat beyond escape/block.

Mark obsolete: `docs/slices/task-win-cancelled-not-w5.md`, `docs/slices/task-win-w4.md`
— superseded by this lock; do not implement them.

---

## 4. Hold (not this slice)

Guide E / Runner D / TV E and auto-walk-to-pin **hold** until a choosable-expedition
replacement is sliced. Route/task menu (Portrait / Lights), stickies, private-heat, and
KEEP/EXPEL are borrowed later — not required to land this win rewrite.

---

## 5. Traps and verification

Do not rename W2 to "escape." Kill the camera win path for real. Do not keep
`Production wins` chrome wired to evil>=good or cameras-short. Never npx vite build.
Gate: existing win / episode-order harness in `gates:party` (extend; do not add a season
sim). Red: any W1–W4 fire remains; camerasLit still ends the night; 2g1e last-vote
ending remains; escape ≥1 good does not FINALE; saboteur block does not end without a
good escape.
If a stated fact is wrong, say so in the report rather than diverging silently.

---

## Appendix: party-loop paste (locked 2026-09-08)

Paste into `docs/design/party-loop.md` (or the living party-loop doc Game reads). Spec rewrite owns how escape maps onto the night loop. Guide/runner hall energy and living-room TV+phones stay.

### Win
- Good team wins if **at least one good robot escapes** by the end of the night.
- Saboteurs / evils win if **no good robot escapes**.
- Captured or expelled players still share their team's result.
- Clearing every saboteur does **not** end the night; the hunter remains dangerous until escape resolves.
- Allegiances reveal at the **ending**, not after each death or expulsion.

### Fear / removal
- **Assimilation stays** as the hunter's fear beat: taken robots are consumed into the hunter (embedded face), permanent for that night, no ghost powers. Speaks IRL only.
- Between expeditions / jobs: thin **KEEP / EXPEL** checkpoint — nominate a living robot, short defense, private ballot. Strict majority expels; tie keeps. Expulsion removes them from the next job without revealing allegiance.

### Still steal (mechanics, not win rewrite)
- Peelable yellow stickies (one-shot per session)
- Choosable route / task menu for jobs
- Private-heat (or equivalent private-cost) sabotage that looks like honest struggle

### Dies (do not build / do not keep as win)
- **Cameras-as-info** as the season goal (unlock cameras to catch evil)
- **W1–W4** as the win ladder
- **2g1e / find-the-evil** as the primary win fold
