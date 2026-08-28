# Prime Time — the night loop, screen by screen

A critic pass over the UI of **every beat of the game loop**, both surfaces. Audited against
`main` @ `3070db5` plus the casting redress on `claude/casting-screen-layout-crgctg`, 2026-08-28.

**Method — and its one important caveat.** Every finding below is read off a photographed frame
or off the source, and each says which. Frames come from two instruments:

| Instrument | What it drives | Viewport | Trust |
|---|---|---|---|
| `harness/loop-ui-play.mjs` | 8 phones, casting **played for real** | TV 1600×900, phone 390×844 | Picture AND chrome |
| `harness/talk-frames.mjs` | 5 phones, beats walked with the `]` dev key | TV 1920×1080 | **Chrome only** |

`progress/` is gitignored, so every `progress/...` path cited below is a REGENERATED artifact, not
a committed file: run the instrument named beside the finding and it writes them again. Neither
driver is in `gates:party` — both need `npm install` and a browser.

> ⚠️ **`talk-frames` SKIPS CASTING, SO ITS BALLROOM IS EMPTY BY CONSTRUCTION.** `DEV_SKIP` in
> `party-host.js:325` walks `casting → recap`, and the seated circle is placed *during* casting —
> so its Debrief / Reckoning / Vote / Execution frames photograph a room with no chairs and no
> robots in it. That is the harness, not the product. Nothing below treats those empty rooms as a
> finding, and `loop-ui-play` (which plays casting) is the instrument for any claim about what is
> *in* the picture.
>
> **And `loop-ui-play`'s own run stalled on Debrief**, which invalidates three of its FAILs in the
> same way: `D6/S1 · 0 seat chips on the TV nominee board`, `D12 control`, and `D7/S3 · no
> .tally-board` were all measured against a Debrief screen while the driver expected Reckoning or
> Vote (its last line says so: *"beat was DEBRIEF"*). Only 4 of 5 living phones registered READY
> and the beat never advanced. None of those three is filed as a finding here. The one D6/S1
> failure that IS filed — F14, the link list — was confirmed separately in the source and in a
> photographed frame.
>
> This is worth writing down because the existing gate reads the other way: `talk-frames` R2 says
> *"the seated robots' band is clear of chrome · clear"* and passes 18/18 on frames with no
> seated robots in them. It measures where chrome is **not**, and nothing measures whether the
> picture has anything in it — the same blind spot `CLAUDE.md` already names for smash targets.

---

## The thesis: the hierarchy is inverted

One defect explains most of what is wrong across the loop, and it is the same on every beat:

**The furniture is big and the live state is small.**

| Beat | Biggest ink on the screen | The thing the room actually needs | Size |
|---|---|---|---|
| Recap | `The circle` — a nameplate naming nobody, 56px | the three facts | ok (56px) |
| Debrief | `The circle`, 36px | `0 OF 3 READY` — the beat's only exit | **12px, bottom edge** |
| Reckoning | `Reckoning · LIVE · WAITING`, 36px | `NOMINATE. FIRST TAP STANDS.` | **12px, bottom edge** |
| Expedition | `Sam is running` slate, 48px | `CAMERAS 1 / 3 · ALARMS 0` — the run's whole scoreboard | **12px** |
| Execution | `THE VOTE IS IN.` ×3 | who is out, and by whose hand | 36px, said three ways |
| Casting (cards) | `Nobody says a word yet.` 48px | `WARMING THE MANSION · 55%` — what everyone is waiting on | **12px + a 520px bar** |

A sofa is three metres from the television. 12px uppercase grey at three metres is not small
type, it is **no type** — and on four of the eight beats it is carrying the only sentence that
tells the room what ends the beat.

---

## TV, beat by beat

### Lobby — *not photographed*
Source read only (`party-host.js` lobby branch). Join code, QR, seat grid, warm bar, one button.
No finding filed without a frame.

### Casting · the role-card window — **F5, F1**
*Evidence: `progress/r5/01-tv-casting-cards.png` (1600×900, 8 phones, real room).*

- **F5 · the bottom 55% of the television is empty black.** Everything — strapline, kicker,
  headline, eight lamps, bake bar, two grey hints — is packed into the top 45%, then ~500px of
  nothing. The board was built to fix an empty ballroom and it fixed the *ballroom*; the
  **screen** is still mostly empty.
- **F1 · the bake bar is the thing the room is waiting for and it is a 520px sliver** on a
  1600px screen, under a 12px label, below the fold of attention.
- Two grey 14px lines sit under it — `No ballots yet — phones pick a runner and a guide.` and
  `Episode 1 airs every ballot. After the run the room nominates.` — same size, same colour,
  unrelated to each other, separated by a 40px gap that reads as a mistake.
- The `SHOW_LINE` strapline wraps to two lines directly above the `READ YOUR CARD` kicker and
  the two compete; the strapline is show-brand, the kicker is an instruction.
- **What is right:** the eight lamps. Seat chip in the player's own accent, name, state. This is
  the clearest element anywhere in the loop and it is the model the rest should follow.

### Casting · the ballot window — **shipped this session**
Full-bleed feed, ballots as a right-hand overlay, lamps as a lower third. See
`party-warm` W36. Not re-critiqued here.

### Expedition — **F1, F6**
*Evidence: `progress/r5/02b-tv-casting-ballots.png` (the beat had already advanced).*

- **F6 · the rundown ribbon is a hairline.** During the run the rail collapses to 22px, which is
  the locked Direction B rule and correct — but at that height only the current beat keeps a
  label and the other eight become 1px lines with no text. It does not read as "the schedule,
  minimised", it reads as a rendering artifact, and it gives the room no sense of where it is in
  the night. The rule is right; the execution loses the one thing the rail is for.
- **F1 · `CAMERAS 1 / 3 · ALARMS 0` is 12px centred grey.** This is the entire scoreboard of the
  expedition — the only numbers that say whether the run is going well — set smaller than the
  dev badge.
- **What is right:** the run slate. Face, `Sam is running`, `CAMERA WARMING`. A TV that cannot
  build WebGL degrades to something legible and on-brand. **The talk beats have no equivalent —
  see F7.**

### Recap — **F2, F7**
*Evidence: `progress/talk/tv-recap.png` (chrome only).*

- **F7 · the talk frame has no slate.** This frame was photographed with `followLive === false`,
  which is a real state at the top of a night, and the result is an **1888×747 black rectangle**
  filling three-quarters of the television with nothing in it. `runStage` solved this (the slate
  above); `talkStage` never did.
- **F2 · the lower third says `The circle`.** A nameplate exists to name the person on camera.
  With no runner resolved it falls back to a word that names nobody, at 56px, with `LIVE · RECAP`
  under it — which the rail already says twice.
- **What is right:** the three fact cards. `STAYED DARK` / `CAME BACK` / `0`, colour-coded,
  40px+. This is the second-best element in the loop and it is doing exactly F1's job properly.

### Debrief — **F1, F2, F3**
*Evidence: `progress/talk/tv-debrief.png` (chrome only).*

- **F3 · the right column is reserved before it has anything to say.** `CONNECTIONS` +
  `Nobody has reached out yet.` — one grey sentence occupying a 300px column for the first
  half of the beat, with no panel, no border, floating against the picture.
- **F1 · `0 OF 3 READY · TALK. A MAJORITY TAPS READY TO MOVE ON.`** — the beat's only early exit,
  and the count of how close the room is to taking it, in 12px at the bottom edge of the screen.
- **F2 · `The circle · LIVE · DEBRIEF`** at 36px. Names nobody; the rail already says DEBRIEF.

### Reckoning — **F1, F2, F3**
*Evidence: `progress/talk/tv-reckoning.png` (chrome only).*

- Same three as Debrief. `Waiting on phones — nominate.` alone in the right column;
  `Reckoning · LIVE · WAITING` as a nameplate naming a beat; `NOMINATE. FIRST TAP STANDS.` in
  12px flush against the bottom edge, partially clipped.

### Vote — *chrome clean*
*Evidence: `progress/talk/tv-vote.png`.* The `tallyBoard` (`Ballots in`, `2 of 8`, a progress bar,
`needs 5 to carry`) is the one place in the loop where a live count is drawn at the size it
deserves. **This is the fix pattern for F1 everywhere else.**

### Execution — **F4**
*Evidence: `progress/talk/tv-execution.png`.*

- **F4 · the same sentence, three times, in three sizes.** `THE VOTE IS IN.` as the verdict
  plate's line (36px), `Nobody / NO EVICTION` as the nameplate (36px/12px), and `THE VOTE IS IN.`
  again as the kicker (12px). `NO EVICTION` appears twice. Three elements, one fact.

### The seated circle — **F11, F12, F13**
*Evidence: `progress/r5/04-tv-debrief.png` and `08-tv-reckoning-named.png` — 8 phones, casting
played, circle really seated. These are the only frames in this pass with the cast in them.*

- **F11 · the name tags collide, and they scale the wrong way round.** In `08` the tag `JOHN`
  completely covers `JO`; one `SAM` is clipped to `SA` by the other `SAM`; `ELLIE` overlaps `BO`'s
  row. And because the tags are perspective-scaled, the two players nearest the camera get 30px
  type while the far side of the circle gets 11px — so the loudest labels are on the robots you
  can already see best, and the ones you are squinting at stay small. The locked rule (legible at
  low quality and distance) is met; what is not met is that eight of them have to coexist.
- **F12 · the tags are the one public list with no seat number.** `ALEXANDR` and `MARY-KAT` are
  truncated mid-word with no ellipsis, and the two Sams are two identical `SAM` tags. Every other
  aired or tappable list carries `seatChip` — the nominee board, the vote list, the vote receipt,
  the casting lamps. The name floating over the actual robot, which is the one the room looks at
  while arguing, does not.
- **F13 · the camera is not outside the circle.** The locked rule is *"outside the chair circle,
  sweeping, keeping the group centred."* In both frames the nearest robot is cropped by the bottom
  edge, a chair back occupies the foreground, and the rug is the largest object in shot. In `08`
  the circle sits right-of-centre with dead wall on the left.

### Verdict — **not on the wire**
The rail draws a `VERDICT` label that never lights (`SHOW_BEATS` has no `verdict`;
`AFTER_RUN_NEXT.execution = 'casting'`). Staged, documented in `episode-order`'s `WIRE_MISSING`.
**A UI finding all the same:** the room is shown a schedule with a step that never happens, every
episode, all night.

---

## Phone

*Source read (`party-phone.js`); frames pending from the `loop-ui-play` run.*

- **F9 · one type style for everything that is not a button.** `paintNominate` can stack four
  `<p class="hint">` lines before the first button — `Tap who you name`, `Standing: …`,
  `First tap stands. No self-nom.` — all 14px, all `#8a7d70`, all equal weight. The instruction,
  the state and the rule are indistinguishable.
- **F10 · the phone still prints the per-round hero the TV just lost.** `party-phone.js:627`:
  `Locked.` / `X walks · Y talks.` — the exact element cut from the TV this session, for the
  exact reason (re-cast every episode, unlearned two minutes later).
- **F14 · the link list is the one tappable list with no seat chip — confirmed defect.**
  `party-phone.js:1756` builds each link button as `${esc(p.name || p.id)}${MARK[block]}` and
  never calls `seatChip`. `paintNominate` (1492), `paintLynchVote` (1555) and the vote receipt
  (1522) all do. So on a table with two Sams, the one list where you choose who to have a
  **private conversation** with is the one list that cannot tell them apart — photographed in
  `progress/r5/05-phone-debrief.png`, two buttons both reading `SAM`.
  `loop-ui-play` caught this as `D6/S1 · 0 seat chips on the pick list`.
  **`party-warm` W35e cannot see it:** it asserts three `seatChip(` call sites exist in the
  source, which they do. A fourth list that never calls it is invisible to that test.
- **What is right:** the vote receipt. `The room recorded` + seat chip + name + the coercion
  reason. It answers "what did the room actually write down", which is the hardest question a
  ballot UI has to answer, and it answers it in the player's own accent.

---

## Ranked for the builder

| # | Finding | Beats | Cost |
|---|---|---|---|
| 1 | **F1** live state is 12px | Debrief, Reckoning, Expedition, Casting | small — one shared component |
| 2 | **F2** nameplate names a beat, not a person | Recap, Debrief, Reckoning | small — draw nothing when there is no subject |
| 3 | **F4** Execution says one fact three times | Execution | small |
| 4 | **F3** right column reserved when empty | Debrief, Reckoning | small |
| 5 | **F7** talk frame has no slate | Recap + any cold start | medium |
| 6 | **F5** casting card window is 55% empty | Casting | medium |
| 7 | **F6** ribbon rail is a hairline | Expedition | medium |
| 8 | **F9/F10** phone type scale + stale hero | phone, several | small |

**F1, F2, F3 and F4 are one change**, not four: a shared "what is happening and what ends it"
component in the lower band, which replaces the nameplate when there is no person to name, and
which the Vote's `tallyBoard` already prototypes.
