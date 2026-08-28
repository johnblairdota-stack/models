# The night has an ending — what shipped, and what is still staged

Built 2026-08-28 on `claude/topdown-expedition-perspective-jxk25c`, from the canvas in this
directory. The canvas is the *design*; this is what the code actually does, including the three
places the design was wrong and the two places the build found a bug that predated it.

Read `../PRIME-TIME-STATE.md` §2 for the before state. Its headline sentence — *"Nothing ever ends
a session"* — is the thing this slice deleted.

---

## What is on the wire now

```
Execution ──► Verdict ──┬── RENEWED ──────────────────► Casting
                        └── FINALE / CANCELLED /
                            ABANDONED ────────────────► Reunion   (session end)
```

**That branch is the first conditional edge in the whole wire.** Every other step in the chain is
unconditional: a beat finishes, the next one starts. `AFTER_RUN_NEXT.verdict` is `'casting'` as the
DEFAULT, and `progressShow` overrules it from the fold.

| piece | where | note |
|---|---|---|
| the beat | `show.js` `SHOW_BEATS` / `AFTER_RUN_NEXT` / `VERDICT_HOLD_MS` | 15s, from `SECONDS[PHASE.VERDICT]` |
| the fold | `room.js` `foldVerdict` / `enterVerdict()` | **extracted** out of `playEpisode`, not copied |
| the airing | `local.mjs` `enterVerdictLive` | `{status, camerasLit, need, episode}` |
| the ending | `local.mjs` `progressShow` casting edge | the conditional |
| the skip | `room.js` `skipToReunion()` + `{t:'skip'}` (isTV) | W6's first emitter, ever |
| the reveal | `local.mjs` `reunionPayload` → `t:'reveal'` | `room.reunionSpecial()` → `reunion.js` |
| the screens | `party-host.js` `verdictFacts` / `reunionStage`, `party-phone.js` `paintVerdict` / `paintReunion` | |
| the pacing | `show.js` `REUNION_PLAN` / `reunionBeatAt` / `rollCallRevealed` | spends the 240s `phases.js` budgeted and nothing ever spent |

---

## Three things the plan got wrong

**1. The Reunion does not break `entitle.js`, and it must not.**
The plan said the reveal would *"deliberately break"* the matrix's `NO ROW. Nobody, ever,
pre-REUNION` on `players[].alignment`. `MATRIX` projects the **state frame**, and a frame-level
exception would have to read *"denied, unless the phase is REUNION"* — a condition inside the one
filter in this codebase that is deny-by-default precisely so it cannot fail open. The reveal is its
own message with its own closed schema instead. The frame filter never learns the word "unless".

**2. `FANOUT_FORBIDDEN` caught the reveal, and that was correct.**
The server threw the first time `t:'reveal'` was fanned: `role` and `alignment` are on an absolute
blocklist. So the fix is a **named** exemption — `REVEAL_EXEMPT = ['role', 'alignment']`, applied to
`reveal.seat` only — rather than a deletion. `cover` stays forbidden even there; `reunion.js` calls
it `believedTheyWere`, which is its name in the design and not a synonym invented to get past a
list. A second name for the same secret is how a blocklist stops meaning anything.

**3. The camera target is ambiguous in the codebase, and the build did not resolve it.**
`COMPOSITION[8].cameras` is **3**. `WIN_TARGETS[8].cameraTarget` is **4**. Both files describe
theirs as how many cameras must be lit to win; the running state counts against the first and
`foldWin` decides W2 against the second. The Verdict plate reports the **fold's** number, because
the plate is a report on the fold, and the number travels on the wire so the two cannot drift on
screen. **Which one is the objective is a design call for John, not a refactor.**

---

## Two bugs the build found

**The season was one episode short, live.** `foldVerdict` measured `EPISODE_CAP` against
`state.episode` — and `playEpisode` bumps that *before* the live Verdict beat is reached but
*after* the offline one. A real room stopped after four of five episodes while the offline machine
stopped after five, **and both had a green gate**. This is the same shape as the premiere-skip bug
`episode-order` was written for, one layer up: not "one path forgot", but two machines each gated
as correct. Fixed by measuring `state.airingEpisode`, which both paths set at the top of the
episode. Gates: `episode-order` E6/E6b, `party-night` N17n, `win-machine` W10c.

**The TV's `onTalk` was a hand-written copy of `TALK_BEATS`.** `onRun` reads it, and `hasPair` is
still true at the Verdict — so the first beat the copy had never heard of would have painted the
expedition over the Showrunner. It is derived now. `party-warm` W27e was rewritten: it had been
pinning the copy's literal source text, which locked in the second table rather than the behaviour.

---

## Still staged, and staged honestly

- **The Director's Cut has no footage.** `decisiveEpisode` returns a bare `{episode, because,
  atSeq}` pointer and the beat prints exactly that, saying so. Replay is its own slice.
- **Six awards of eight.** The two uncomputed — The Klutz, The Liar in the Ear — need events
  nothing writes yet.
- **The chat beat is empty** until something posts `chat.posted`. `chatUnmixed` is wired.
- **The Reunion has no server clock**, on purpose: nothing after it decides what a phone may do, so
  the television paces itself off `REUNION_PLAN`. If a beat here ever becomes interactive, that
  decision flips.
- **A live episode records `win.checked` / `verdict.aired` twice** — once stale at casting
  resolution (inside `playEpisode`) and once complete at the Verdict beat. Fixing it means teaching
  `playEpisode` that it is not the whole episode, which is its own slice.
- **`room.js:34 PHASES` is still dead** and still wants deleting.

---

## Gates

| gate | assertions |
|---|---|
| `party-night` | N17h0/N17h0b · N17h/N17h2 · N17j/N17j2 · N17k–N17k4 · N17m–N17m3 · N17n/N17n2 |
| `party-warm` | W47–W47i; W27/W27e/W30/W30f **inverted or rewritten** |
| `episode-order` | `WIRE_MISSING` empty (E2b stops passing vacuously) · E6/E6b |
| `win-machine` | W10/W10b/W10c — the assertion that could not be written before this slice |

The inversions are the interesting half. `party-warm` W27, W30 and W30f were all asserting the
**absence** of an ending — `!SHOW_BEATS.includes('verdict')`, the grey stub chip, `execution →
casting`. Each was rewritten to assert the new behaviour plus a control, never weakened. W47e is the
sharpest example: it asserted the Reunion screens revealed nothing, which was true for exactly one
commit, and leaving it would have made a gate into an argument against finishing the beat.

**The two assertions worth keeping in mind:** `party-night` N17h0b, that the aired verdict carries
no feed count (and no `rule`, which is the same leak in a costume — W3 *is* the feed count in
words); and N17m3, that nothing named anyone else's side before the reveal did, swept against the
socket transcript because `party-isolation` drives `createRoom` directly and never sees a fanout
at all.
