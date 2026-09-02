# Slice: the expedition, as locked — the paper catches the wire

**The card (The Desk, CoS PR #61):** *"camera spec still says first-person."* It did. The wire
moved on 2026-09-01/02 — auto-walk, pins, objective pins, produced follow, Guide E / Runner D /
TV E — and four design docs kept teaching the old game. This slice is the paper catching up, the
board that sells it, and the gate that keeps it caught up. **It is a spec slice. It ships no
night.** The playable-night work that builds AGAINST this spec is Game's, and its decisions are
below so Game does not have to re-derive them.

**The board:** *The Expedition, As Locked* —
`docs/design/refs-expedition-locked/canvas/Main.dc.html` (committed — the runner-intel canvases
in `docs/design/refs-runner-intel/` are untracked and `PRIME-TIME-STATE.md` §6 is what losing a
design pack costs; this one is in git). Live canvas:
`https://claude.ai/code/artifact/4d4d6c5f-a8c8-4bec-ae09-58dac1d9025f`.

## 1. File ownership

This slice owns, and touched, exactly:

- `docs/design/rrr-social-deception-mode.md` — D9, D13, §5.7 consequence 2, new §5.7.1 (root tree)
- `docs/design/rrr-phone-ux.md` — D-P1, §3 banner (root tree)
- `docs/design/rrr-task-deck.md` — header amendment, Dark Run runner/guide paragraphs (root tree)
- `docs/design/party-loop.md` — §A-turn line 2, build-list line (this tree)
- `docs/design/runner-intel.md` — discharge note (this tree)
- `docs/design/refs-expedition-locked/canvas/` — the board (this tree)
- `harness/expedition-spec.mjs` — new gate; `package.json` — one chain line; `CLAUDE.md` — one line

**Not owned, deliberately untouched:** everything under `src/`, `net/`, `dist/`. The stale code
comments named in §5 stay as they are — `party-warm` and `dark-run` grep source files, and a
comment edit here is a coupled change that belongs to whoever next owns those files.

## 2. Why this slice matters

A slice doc or an agent brief starts from the design docs. Before this slice, the bible's first
page said the runner is first-person and the evil runner's verb is a throttle — both describe a
game that never shipped, both would send an agent to build the wrong thing with a straight face,
and nothing could go red when it happened. Now the docs say what the wire does, every claim
carries its gate name, and `expedition-spec` (ES1–ES5, 35 checks) reddens the day a stale claim
comes back — in either direction (ES4: rip the pin off the wire and the fresh paper is stale
again).

## 3. Decisions already made — build against these, do not relitigate

Each lock names the instrument that proves it. If a lock reads wrong, argue with John, not with
the gate.

1. **Guide-first. The TV is a produced follow of the runner, never a map.** Chase inside the
   ballroom, top-down over the runner's own rooms outside it, 1.35 s crane between, never a cut
   under the thumb. No route, no hunter mark, no whole-house fit. Guide's map stays private on
   the phone. Gates: `party-follow` F11i–F11i5, `party-warm` W26h/W26h3, `party-follow` F11c2d.
2. **Guide E "Neighbours Only" / Runner D "Frame Bezel" / TV E "Camera Stinger"** are the picked
   boards, shipped as functions: `src/party/intel-pad.js`, `src/party/guidemap.js`,
   `src/party/stinger.js`. No map on the runner's phone, ever — the bearing is bezel pixels with
   no world coordinate. Gates: `intel-pads`, `tv-stinger`, `runner-intel` RI22.
3. **AUTO-WALK to the guide's pin, one door at a time — never to the true target.** The pin is on
   the wire at audience `crew` (`you.pin.{x,z,roomId,kind}`); the TV is told it and may not draw
   it. With no pin nobody moves. Gates: `runner-intel` RI10–RI13, RI20–RI20g, `intel-pads`
   IP11b–d.
4. **The guide also pins job objectives** — the twin faces (SMASH, pick a face) and the camera
   install position (DRILL) — **and the thumb may not pick them.** Evil pins the decoy face or
   the FLOOR bracket; good pins the real one or HALL; nothing special-cases either.
   `objectives.js` owns the kinds and cannot import `realFaceFor` / `drillShotFor`. An objective
   pin dies with its job; a door pin survives. Gates: `runner-intel` RI19–RI19r2, RI3c.
5. **The stick is a lateral dodge only. HOLD hides behind furniture. No hide in an open hall.**
   The staged RED PASS on the TV is a seeded clock — no position, no target, and the clock keeps
   running while hidden. Quiet-hide is the tell. Gates: `runner-intel` RI8, RI20b, `party-warm`
   W26g.
6. **Hunter AI is a door and it is shut. Do not build the hunter. Do not generate hunter art.**
   Warmth-strip fields on pads are hunter fields; `padLeaks` refuses the word. Gate:
   `intel-pads`, `tv-stinger` TS6.
7. **The fake cue buttons are gone** — CLOSE / LATE / GOING and GO / HOLD. Voice stays in the
   room. One SAY line of copy; FOOTSTEPS stays a small line. Gates: `expedition-jobs` J7/J7b,
   `runner-intel` RI14c.
8. **Name tags: overlap is fine; a name entirely gone is not. No T7 layout. No pocket fact.**
   See §5 — the second half of this lock is currently *measured false* on the shipped arm, and
   the fix needs John.

## 4. The traps — each has cost real time here

- **Exact sentences, not words.** `expedition-spec` bans the stale CLAIMS byte for byte. The
  words "first person" legitimately survive in three places (D13's overturn condition, the
  motion-sickness v2 note, `party-loop.md`'s struck build-list line — struck, not deleted,
  because the bible QUOTES it). Do not "clean up" those survivors; ES1:loop-struck reddens if the
  struck line vanishes.
- **CRLF.** Any new check that reads a source or doc file must normalise `\r\n` → `\n` first
  (`host-desync` H8 was red on Windows, green in CI, against byte-identical content).
- **Untracked canvases.** `docs/design/refs-runner-intel/` is John's disk, not git — CI has no
  such tree. Never make a chain gate read it unconditionally (`tv-stinger` TS3i's `maybe()` is
  the pattern). The new board is committed precisely to avoid this class.
- **Docs are quoted by gates and code.** Before editing a design doc sentence, grep `harness/`
  and `src/` for it. None of the sentences this slice changed are read by any gate (checked);
  the next one might be.
- **No GLSL files were touched.** If your follow-up touches a file containing `/* glsl */`, run
  `node harness/lint-glsl.mjs` after each edit, and build with `npm run build`, never
  `npx vite build`.

## 5. Stated facts checked against the code — where the given brief and the tree disagree

Per the slice rule: a wrong stated fact is said out loud, not diverged from silently.

- **"A name entirely gone is not fine" is the lock, and today it is false on the shipped arm.**
  `tag-census.mjs` T7 measures the worst seat at **100% buried** (seat 7 at −55.8°). That file is
  deliberately OUT of `gates:party`; the fix moves where the tag floats, which is inside the
  locked tag rule — John's call. This slice recorded the lock as intent and changed nothing.
- **`src/party/darkrun.js:35-41` still says the throttle is "the runner's dual-use verb" and
  that "the first-person view [is] on the TV".** Both halves of that comment are stale — the
  stick stopped being move on 2026-09-01 and the picture was never first-person. The MODULE is
  not dead: `harness/dark-run.mjs` (in the chain) imports `DETENT` and gates the noise maths, so
  the numbers still matter even though no thumb selects a detent any more. Comment fix belongs
  to whoever next owns that file; `dark-run` greps it, so test after.
- **`src/party/follow.js:866-872`** describes `party-loop.md` line 21 as making "the runner a
  first-person body" — true as history of the doc, now confusing since the doc is amended. Same
  ownership rule as above.
- Everything else in the brief checked true against the tree: the pin is on the wire at `crew`
  with `t:'pin'` refused from non-guides; auto-walk resolves one door at a time; objective pins
  exist with the thumb-pick removed; the six cue buttons are gone; the red pass is staged with
  no hunter.

## 6. Verification — run these, look at this

```bash
cd web-prototype
node harness/expedition-spec.mjs      # 35 ok · 0 fail
npm run gates:party                   # the whole chain, expedition-spec last
```

Negative control (proven once already, 2026-09-02): restore any one amended doc from `65ed388`
— e.g. `git show 65ed388:docs/design/rrr-phone-ux.md > docs/design/rrr-phone-ux.md` — and
`expedition-spec` exits 1 with red ES1/ES2 lines. Restore the file afterwards.

## 7. The regression net

`expedition-spec` goes RED if: any of the seven stale first-person / throttle sentences returns
(ES1), a locked claim is deleted from a doc (ES2), the objective-pin rule leaves the written
spec (ES3), or the code the paper cites stops existing where it says (ES4). ES5 is the control —
every needle, planted, must be caught, or the list is hand-kept.

**If a stated fact in this slice turns out to be wrong, say so in your report rather than
diverging silently.** That rule caught the tag-lock contradiction in §5; it will catch the next
one.
