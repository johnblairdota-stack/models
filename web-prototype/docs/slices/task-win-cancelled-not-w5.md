# Slice: FLAG — CAST10 Production win is not W4 and must not be W5

Decided plan. If a stated fact is wrong, **say so in the report rather than diverging
silently.**

Base: `main` at `381ae40`. **Grok, not Max. Do not merge.** This is a flag, not the next
build. Next is `task-stuck-runner.md` (pin clocks recap). Do not invent a SHOW beat.

CAST10 printed `CANCELLED` / `Production wins` with **3g2e still living** (Ada, Gus, Hal
vs Cy, Dee). Past ep5 (ep6–8). No 2g1e. CoS: **not W4**.

Verified on `381ae40` `src/party/win.js`:

- `TICK_ORDER = W1, W3, W2, W4`. W5 is deleted. H278 overruled: a camera miss at the cap
  is not a Production fold. Missing cameras does not win for Production. Lighting them
  still wins for the cast (W2).
- W4 fires only when `alive(evil) >= alive(good)` on take/execute. CAST10 living 3 good
  2 evil cannot be W4.
- W3 fires when `fed >= feedTarget` (goods **taken** by the hunter, not lynched). CAST10
  dead Fox/Ben/Eli were executions (`row.alive=false`), not photographed hunter takes.
- W1 is all evil dead. Evils Cy+Dee still living.
- W2 is cameras-lit FINALE, not CANCELLED. CAST10 cameras were 0 of 4 / unquoted.
- W6 is `host.skip` → `ABANDONED`, not `CANCELLED`.
- `outcomeLine(CANCELLED)` is the chrome `Production wins. The Reunion is next.` CAST10
  stored that chrome in `rule`, not a W-key. Reunion card: `Cy PRODUCER · SURVIVED
  PRODUCTION`.

So chrome said Production won, and **no remaining W produces that at 3g2e without a
leftover cameras-short / cap fold**. Flag it. Do not restore W5. Do not invent a new
SHOW beat. Do not call this W4.

---

## 0. Why this slice exists

We deleted W5 so a night that misses cameras at the cap keeps playing (or ends on W1 /
W2 / W3 / W4 / W6). CAST10 still printed Production wins after ep5 with 3g2e living.
That is a leftover fold until someone quotes the `fire()` that wrote it.

---

## 1. File ownership

**Only if** you find a leftover cameras-short / cap Production `fire()`. Then you may
edit: `docs/slices/task-win-cancelled-not-w5.md` ; `src/party/win.js` (delete the leftover;
do not add W5; do not change TICK_ORDER); the win / episode-order harness already in
`gates:party`.

**Do not edit:** follow cameras, expedition auto-walk, execute linger, emote chrome,
vote-HIT. Live 5178/5181. Do not invent a SHOW beat.

---

## 2. The lock

1. W5 stays gone. A camera miss at the cap is never Production.
2. `CANCELLED` / `Production wins` chrome is only legal from W3 (fed >= target) or W4
   (evil >= good). CAST10 3g2e is neither until a quoted `fire()` says otherwise.
3. Do not invent a new SHOW beat. Do not invent 3v1 as a special count. 2g1e last vote
   stays for that count, and CAST10 was not 2g1e.
4. Quote chrome. If the leftover is outside `foldWin`, say so in the report.

---

## 3. Verification

Gate: existing win / episode-order harness in `gates:party`.
Red: W5 restored; cameras-short at cap prints `CANCELLED`; CAST10-class 3g2e Production
win with no W3/W4 `fire()`; a new SHOW beat.
If a stated fact is wrong, say so in the report rather than diverging silently.
