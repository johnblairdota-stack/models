# Critic ledger — what was built, what was banked

Every critic suggestion lands here, in one of two columns, with the reason. **This file is what
the 20:00 brief is read from**, so a suggestion that never reaches it is a suggestion John never
hears about — which is the failure mode this file exists to prevent.

Rules for using it:

- **BUILT** — implemented. Name the gate that locks it, or it is not finished.
- **BANKED** — not implemented. Say WHY in one line: wrong for the feel, too big for now,
  contradicts a locked rule, or unproven. Banked is not rejected; it is waiting.
- **PUSHED BACK** — the critic was wrong, and the reason. John asked for this explicitly:
  *"push back on critic feedback that is illogical and doesn't align with the feel of the game."*
  Recording it stops the same wrong note being re-filed every round.

---

## Round 1 — social-deception design critic

### BUILT
- One conversation per player per beat; Disconnect ends your turn — closed a hub exploit that ran
  one player through **seven** private channels in a single Debrief. Gate `link-merge` L9c/L9d.
- The person walked out ON keeps their turn — being dumped is not a choice you made. L9c2.
- Refusals are public on the TV for six seconds; every pending request is shown, not just the
  first; pairs no longer erase pending. L74.
- The refused player and the dumped player are told. Previously both silent.

### PUSHED BACK
- *"The verbatim log is the problem — a screenshot of a phone is evidence."* Deniability survives:
  the log is cleared on unlink and on the beat change, and a photo across a table does not
  reliably attribute lines. The real cost is **latency**, not receipts — typing is 30-60s where a
  whisper is 8. Acted on the latency (the 90s pair clock), not on the receipts.

---

## Round 2 — adversarial abuse critic

### BUILT
- **A crash that killed the whole server process** from one phone message
  (`{t:'whisper', text:{toString:'x'}}`), across rooms. Wrapped + non-string inputs refused.
  Gate L30/L30b, and L40 fires the real payloads at a real server.
- `acceptLink` dropped `used`, defeating the one-pair-per-beat rule shipped an hour earlier. L35.
- Only the TV may drive the show beat — any phone could send `{t:'show'}` and wipe live pairs. L31.
- `LINK_REQUEST_MS` was dead code; `expirePending` was never called. L32.
- Ghost pairs — a partner who yanked their cable held their victim for the whole beat. L33/L41.
- A closing socket deleted a *resumed* socket's connection entry. L34.
- One outgoing request at a time (a crafted client held five). L36.
- The merged name is previewed on the accept prompt — the merge is steerable at a victim. L37.

### NOTED, NOT A DEFECT
- Category 1 (privacy) came back **clean** after 15 socket probes and a 6-phone browser run. The
  structural defence holds: `fanout()` throws on an unknown `t`, `whisper` is absent from
  `FANOUT_KEYS`, `applyWhisper` is the only producer. Do not let a later fix reintroduce a
  whisper into a broadcast.

---

## Round 3 — play-feel critic

### BUILT
- **The pair clock** (`PAIR_MS` 90s). The cap had become a lockout: the first two couples held
  both slots for five minutes and everyone else read ROOM IS FULL. L70.
- **The pair board** on the TV, in the `.talk-side` slot that was sitting empty during Debrief,
  carrying both real names — the merged plate erases them. L74c.
- Reckoning's pair sheet removed from the UI (cutting `LINK_BEATS` had killed only the rules,
  leaving two lists of the same names, one of which accuses you of murder). L73.
- "ROOM IS FULL" no longer stamped on people it is not true of — the cap is checked last. L71.
- The vowel seam: **33% of merges → 0%** opened on a two-vowel cluster. L72.
- The ready count was the *fallback* argument, so it vanished the moment anyone paired. L74.
- The Debrief lower-third named the expedition runner — wrong beat, loudest thing on screen. L74b.
- The play harness served vite and manufactured a false "completely broken" verdict twice. L75.

### PUSHED BACK
- *"Raise the merge length floor to 4 — three-letter merges read as typos."* Measured worse: it
  takes JOE, JIM and JAM with it, and turns them into JOOE, JOIM, JOAM. Went to John as a taste
  call; he said **"3 letter is fine."** Pinned at L72c so it cannot drift back.

---

## Round 4 — full-loop critic, 8 players

Three full nights, eight phones, every beat photographed on the production build. 132 shots in
`progress/r4/`, three ballots driven to a result in `progress/r4v/`.

### BUILT — code fixes, all gated and all controlled
- **Every phone printed a raw socket id at the execution** — "p7 is out." on eight handsets while
  the TV correctly said "MARY-KATE 3 IS OUT." The sheet was handed the `alive`-filtered list, so
  the person being executed was already missing from it. L91.
- **The dead were still casting.** An executed player kept being served a casting ballot and it
  counted — the dead helped choose who went into the mansion. They were already blocked from
  nominating and voting; casting was the one that had no living check. L92.
- **A merge could equal a player's own PLATE.** `ok()` compared against the full typed name, not
  the 8-character plate, so `Bo + Bartholomew = BARTHOLO` put Bartholomew's own name in green
  over both their heads. L90.
- **A mutual DONE said "They disconnected."** — and so did the 90-second clock, which is nobody's
  choice. L93.
- **The TV told the room to nominate during the Vote.** L94.
- **The nominee's ballot promised a choice she did not have** — "pick one standing nominee" over
  a single NO ONE button. Same copy when nobody had been nominated at all. L95.
- **No vote was ever acknowledged.** "Ballot in" was optimistic local state, and the self-vote
  coercion to NO ONE was invisible to the person who cast it. The server now sends the voter a
  private receipt naming what it actually recorded. L96/L96b.

### PUSHED BACK
- **S2 — "put both real names under the merged name on the 3D plate."** John already decided this
  ("JELLIE only — funnier, and the room has to work out who's missing"), and the need it names is
  already met: the CONNECTIONS side board carries both names, which is where a critic can read
  them without spoiling the plate. Re-litigating a settled taste call.
- **D16 (stick position) and D15 (blank casting TV)** — the critic labelled both as suspicions
  rather than findings, correctly: the sticks were driven by Playwright, not a thumb. Not acted
  on as defects; D15's real content is folded into the UI design pass as S11.

### BANKED — for John, not built
- **S5 · Wire one role ability.** The critic's diagnosis of "not fun yet": all eight role cards
  are flavour text with no control anywhere. *"This is the difference between a night loop and a
  game."* The biggest item on the page and a design decision, not a fix.
- **S4 · Give the six non-runner players something to do during the Expedition.** The reaction
  pad exists and sends nothing (D3) — six of eight players have four buttons that print a word on
  their own screen and reach no other machine.
- **S13 · Sound.** There is no audio anywhere in the loop. Medium-sized, never asked for.
- **S14 · The shut-out Debrief sheet is seven grey refusals.** The scarcity reasoning holds; the
  experience of being on the wrong side of it does not.
- **D3 · The reaction buttons are unwired** — the mechanism half of S4.
- **D4b · Nothing marks the dead in the ballroom.** Three copy strings promise a face-down
  nameplate; no implementation exists. The voting half is fixed; the *picture* is not.

### IN THE UI DESIGN PASS (round 4's `/design`)
D2 name tags blowing up at close range · D12 READY clipped off an 8-player Reckoning ·
D8 two colliding clocks · D6/S1 duplicate names indistinguishable on every list and the aired
ballot · D11/S6 the Recap says nothing (`recapBoard` is dead code) · D7/S3 no ballot progress on
the Vote · S11 the blank casting TV · S8 controls in the middle of the phone.

### THE ROUND-4 DESIGN PASS — drawn, not yet built
Canvas: `docs/design/loop-ui/` → https://claude.ai/code/artifact/d566eace-383c-464e-b250-03a932b53f58

| Artboard | Fixes | The move |
|---|---|---|
| TV · Recap | D11/S6, D8 | Call `recapBoard()` (it exists, it is dead). Four facts at broadcast size. Mast keeps the beat LABEL, plate keeps the NUMBER — one clock. |
| TV · Vote | D7/S3, D6/S1 | "5 of 8 in · needs 5" + bar; goes green and arms 3·2·1 when all are in. Nominee rows carry seat number + accent. Leaks nothing — names air 25s later. |
| TV · Casting | S11 | The blank 20s while everyone reads a card becomes eight seat lamps and a "5 of 8 have read it" count. Names no role. |
| TV · Name tags | D2 | `clamp(d/4, 1, 2)` → `clamp(d/4, 0.34, 2)`. Near end may shrink, so the plate holds screen size instead of world size. Far behaviour identical, so N-gates still hold. |
| Phone · Reckoning | D12, S8 | Page stops scrolling: header + action bar pinned, only the people list scrolls. READY is always on screen with its majority bar. |
| Phone · Vote | S1, S8 | Seat + accent per option, the L96 receipt quoted back in the room's words (incl. the self-vote → NO ONE coercion), same pinned bar. |

---

## Round 5 — the UI pass, BUILT

All six artboards shipped, plus three defects the build itself turned up. Gates: **25 suites, 961
assertions, green.** Measured on a real eight-phone production run: `harness/loop-ui-play.mjs`,
22 claims, green, shots in `progress/r5/`.

### BUILT
- **D11/S6 · The Recap says something.** `recapBoard()` had been defined, gated by W31 and NEVER
  CALLED for four rounds — the gate asserted the function existed and its CSS was compact, both
  true, while the beat rendered `talkStage`. Now `recapFacts()` in the lower band at 56px:
  STAYED DARK / CAME BACK / ALARMS 0, readable from a sofa. W31 now asserts the CALL SITE.
- **D8 · One clock.** The mast and the stage printed the same number, from the same tick loop,
  36px and 64px apart. The mast now stands down when the body already carries a
  `[data-show-clock]` — measured off the built HTML, so a beat added later cannot bring the pair
  back. W35 + control. **The phone had the identical defect** and got the identical rule (W35l).
- **D7/S3 · Ballot progress on the Vote.** New `t:'tally'` fanout — `in`, `living`, `need` and
  nothing else. Goes green and says "every ballot in — closing" when it fills; stands down the
  moment the result exists. L100–L100f, including a control that fires a widened payload at
  `fanoutViolations` to prove the closed schema REFUSES a tally rather than filtering one.
- **S11 · The blank Casting TV.** Eight seat lamps with names and seat numbers. **The first cut
  of this was wrong and the probe caught it**: it printed "0 of 8 have sent a ballot" through a
  window where no ballot can exist (intros need the bake, ballots need the intros), so the
  counter was pinned at zero by construction on a screenshot that looked perfect. The bake bar is
  what the room is actually waiting for, so that is what that window shows now. W35c/W35c2.
- **D6/S1 · Which Sam.** Seat number in the player's own accent on every tappable row, the aired
  nominee board, the ballot receipt, **and the lower third** — which names one person at 36px and
  was the least useful thing on screen with two Sams in the room. W35e/f/f2.
- **D12/S8 · READY was off the bottom of an eight-player Reckoning.** Sticky dock, and it is the
  LAST thing appended or it covers the pad. Measured: **1099px of sheet in an 844px window, READY
  bottom at 786** — on screen, in the bottom half, with a majority bar. W35g/h.
- **D2 · The plate that ate the room.** `clamp(d/4, 1, 2)` → `clamp(d/4, 0.34, 2)`. 6.7× at arm's
  length becomes 2.3×, and it is genuinely flat from 1.4 m out to 4 m. Far half untouched, so the
  legibility gates read exactly what they read before. W35i + the arithmetic as its control.
- **Recap chips duplicated the recap facts** — `recapMini` now stands down wherever a facts board
  is on screen. The D8 defect in another costume.

### PUSHED BACK
- **Nothing this round.** The critic's remaining items are the banked design decisions below.

### STILL BANKED — unchanged, for John
S5 wire one role ability · S4 / D3 the reaction pad reaches no other machine · S13 sound ·
S14 the shut-out Debrief sheet · D4b nothing marks the dead in the ballroom.

---

## Round 6 — the JELLIE data stream (John's ask, not a critic's)

*"green matrix esc data particle affects to flow between the name tags of any two connected
players."* Designed in `docs/design/link-stream/` →
https://claude.ai/code/artifact/06487a68-6580-48fd-a583-0f6fea41d3b9

### BUILT
- **`src/characters/link-stream.js`** — 26 katakana glyphs riding a faint sagged string between
  the two paired plates. Caption layer 1, so the post fog can never eat it (same rule as the
  tags). Gates W36–W36g in `party-warm`, and the live numbers are measured by `jellie-play`.
- **Matrix green (option B)** — John's call off the two-panel artboard.
- **The glow and the string**, on John's second look: *"it should have a matrix green glow and a
  faint string. if that is in the game I can't see it."* He was right on both counts. The glow is
  BAKED into the glyph texture, because captions draw after the grade and no bloom pass can ever
  reach them; the string was in the design from the first sketch and the first build shipped
  without it. W36c and W36d pin both.

### DECIDED — John, 2026-08-27: the stream stays STEADY
- **A surge on the line each time a whisper is sent.** Drawn as option B on the Behaviour
  artboard. Two costs: it airs WHEN a message was sent, so the room can time a pulse against a
  face; and the fact of a send does not reach the television at all today — `t:'whisper'` is
  absent from `FANOUT_KEYS` and `fanoutViolations` REFUSES it rather than filtering it. Building
  it means opening that door.

  **John chose A — steady.** So the surge is not a backlog item, it is a CLOSED call: the stream
  draws the channel and never the traffic. Do not re-file it. It is enforced, not just recorded —
  `party-warm` W36b strips the comments and fails if this module can reach a whisper, a message
  or a role at all, so the door cannot be opened by accident on the way to something else.

### FOUND WHILE BUILDING — not a game bug
- **`jellie-play` manufactured its fourth false verdict.** It threw "Ellie was never offered a
  Connect button" on a build where the button was in the screenshot taken one line earlier. A
  server trace named it exactly: the request had stood for **20.2 s** and `LINK_REQUEST_MS` is 20.
  The harness was writing 1 MB PNGs of a WebGL ballroom inside the product's own timeout. It now
  does the round trip that has a deadline FIRST and photographs afterwards, clicks by selector
  rather than through a handle that `paint()` has already detached, and reads the TV's text
  instead of screenshotting it inside that window.

---

## Round 6 — the face

John: *"we will also use this svg as the new lobby colour selection face as well."* The lobby face
was replaced, not restyled. Gates: **25 suites, 973 assertions, green.**

### BUILT
- **The lobby face is now UNIT-4H's own head.** What shipped until today was a diamond on a
  rounded blob, authored before the character existed and never revisited — it shared no
  silhouette, no screen and no eyes with the robot the player drives. The new one is measured:
  the outline off `assets/mv/player/baseline_front.png`, and the eyes, brow arcs and mouth off
  `FACE_SURFACE`, which is the shader that paints the real faceplate. Gate `party-warm` W40a.
- **The player's two colours changed jobs.** Shell → the helmet and four tones derived from it.
  Accent → **the light** on the screen. The glass stays blue for everyone, because the glass is
  the robot and the light is the player. This is also what makes an emote free: the face is a
  screen, so an expression is the light redrawn, not new art. W40d.
- **Eight of the twelve shells are darker than the TV background**, so a flat fill sank the whole
  head into the screen and left two floating eyes. The rim, the crown and the pods all open up as
  the shell darkens — every shell now clears 0.55 luminance on its edge. W40b + its control,
  which measures the same twelve WITHOUT the rim and is the defect.
- **One painter for all thirteen coloured parts.** The old face had two, so the phone picker and
  the TV seat grid each recoloured it with two `setAttribute` calls. Four of the new tones are
  DERIVED from the shell, so that same patch would have left the crown, the pods and the rim on
  the previous player's colour — on the one screen whose whole job is choosing a colour. Both
  call sites now go through `paintLook`, and W40c fails if either names a part itself.
- **Three treatments, one drawing.** `portrait` for the picker and the intro; `chip` (fine detail
  dropped, features fattened) for every mount at 64px and below — the seat grid, the pair board,
  the nominee rows; `screen` (no helmet) is drawn and gated but not yet mounted anywhere.

### ALSO BUILT — S4 / D3, the reaction pad, banked since round 4

John: *"I want portrait for the pad."* So the pad ships on the full-detail face.

- **The pad reaches another machine.** These four buttons had printed a word on the tapper's own
  phone since the first build and stopped there — six of eight players holding a dead remote for
  the whole run. A tap now airs on the TV, attributed, in a strip under the run picture. New gate
  suite `harness/react-pad.mjs`, 22 assertions, wired into `gates:party`.
- **Each button wears your own face doing that reaction.** Clap, boo, sus and shock are four more
  moods on the same drawing, so the lobby face and the pad cannot drift apart. R50–R52.
- **BOO angles its brows.** A frown on its own reads as disappointed; the dropped inner end is
  what makes it an objection — the same cue `uEyeCant` gives the hunter in the 3D face. R51.
- **Four rules, all server-side and all gated.** The dead do not react (R3, same reasoning that
  gave casting a living check at L92). Expedition only (R4) — opening it across the talk beats
  would put a second, free channel beside the pair system. A 2.5 s cooldown (R6), because
  unlimited turns the strip to mush and one-per-beat makes people hoard it. Six on air, one row
  per player, newest first (R8/R9) so two fast thumbs cannot bury everyone else.
- **A refusal is silent** — nothing back to the tapper and nothing to the room. "JOHN tried to
  react" is itself information about a dead player or a player on cooldown, aired to eight phones
  in the one beat where reading the room is the game.
- **The payload carries no identity and no free text** — `t · from · r · at`. R30 fires four
  widened versions at `fanoutViolations` and asserts the schema REFUSES them rather than
  filtering. The `text` one is the dangerous case: a whisper channel with no pair, no clock and
  no cap is exactly what the link system exists to prevent.

### STILL BANKED — for John
- **S5 · Wire one role ability.** Now the biggest banked item by a distance, and the critic's own
  diagnosis of "not fun yet": all eight role cards are still flavour text with no control.
- **S13 · Sound.** There is no audio anywhere in the loop.
- **S14 · The shut-out Debrief sheet is seven grey refusals.**
- **D4b · Nothing marks the dead in the ballroom.** Three copy strings promise a face-down
  nameplate; no implementation exists.
- **Reactions on the talk beats.** Deliberately not built. `REACT_BEATS` is the one-line
  widening, but it is a decision about the pair system, not a wiring job.

Canvas: https://claude.ai/code/artifact/62ad6812-fcd2-479c-ab46-b2e43791e806

---

## Round 7 — the camera and the controls (John's note while playing)

*"navigating the mansion is clunky with the camera and controls (if the camera clips the wall it
pushes into the players robot and the direction of the movement is affected)."*

One sentence, **one root cause, two symptoms** — and the second was the serious one.

### BUILT
- **The stick's frame is now the STEERED yaw, not the lens.** `basisYaw()` measured `eye → look`,
  so every time the operator corrected a shot around a wall, FORWARD rotated under the player's
  thumb. Worse, `_reel`'s last resort dropped the eye behind `runner.facing` — a different angle
  — so a bad corner could swing the controls in a single frame. Gates F10d/F10d2/F10e.
- **The lens has a floor (`CAM_MIN_DIST` 1.15 m).** It used to reel in to 0.20 of the chase
  distance: 0.58 m from the chest of a robot half a metre across. F10/F10a.
- **The same defect in `reelToSight`**, found by the control rather than by John — the warm and
  intro cameras had their own copy of the ladder, whose last resort put the eye ON the target and
  lifted it 30 cm, i.e. inside the head of the robot walking in. That is the camera the room
  stares at for half a minute while the mansion bakes. F10b.
- **A swing-dominated correction ladder, chosen from measurements rather than taste.** The first
  cut spread its tries evenly across swinging, lifting and pulling in. `cam-clip-drive` counts
  which candidate wins: swings won 8, **lift and pull-in won zero**, and the fallback fired 72
  times. Lift cannot clear a wall — walls run floor to ceiling. Rebuilt around swings: the
  fallback now never fires, and the longest stretch pinned at the floor went **63.8 s → 0.7 s**.
- **The floor is re-applied AFTER the smoothing.** Every candidate was a legal 1.15 m and the
  drive still measured **0.42 m** — worse than the defect being replaced — because the eye lerps
  in a straight line and the chord of a wide swing cuts through the runner. A gate that only read
  the ladder would have called it fixed. F10f.

### MEASURED, not asserted — `harness/cam-clip-drive.mjs`, 9 checks
Drives the runner doorway to doorway (a random walk almost never blocks the shot — the first
version recorded **zero** corrections in 75 s and its own control caught that). Over 70 s with 87
corrections: min lens distance **1.15 m**, median **2.63 m**, and the stick's frame moved
**0.0°** across 640 samples while the lens itself swung 84°.

### WORTH WATCHING
On a route that hugs doorways the lens now swings a lot (84° over 70 s) to keep a clear shot.
That route is deliberately pathological; an ordinary walk triggered 0–3 corrections in 75 s. If
the camera ever feels busy in real play, `REEL_TRIES`' widest swings are the first thing to trim.

---

## Round 8 — the four perspectives (John's ask)

*"ship the perspective toggles. The roof will probably need to be see through so they work. The
control and camera may also need to adapt the method for the different perspective positions."*

### BUILT — `P` on the dev TV cycles chase → wide → iso → top
- **A perspective is HELD, never cut to.** `CUT_SHOTS` is the director's pool and deliberately
  excludes the new three: a director that tried `top` for five seconds mid-corridor would be
  taking the controls off the player. It rides the existing `shot` cue, already in `CUE_KINDS` and
  already validated at the iframe's door — no new channel. F11/F11a.
- **The roof comes off for `iso` and `top`** via the flyover's existing `room.setLid(false)`, and
  `_valid` stops refusing an eye above the storey, or the reel would fight the rig every frame.
- **And what HANGS from the roof comes down with it.** The first overhead shots had a chandelier
  swinging through the middle of frame — a chandelier is a prop under the ceiling, not part of it,
  so the lid rule never touched it. Restores only what it took. F11c2/F11c3.
- **The key light moves over the runner when overhead.** It is a point light with a 3.5 m reach
  and `top` puts the lens 9 m up, so the first top-down shot came back almost black.
- **The controls needed no special case, and that is a result.** Round 7 made the stick's frame
  `_lockYaw`, which is a real yaw even looking straight down — where a camera-derived frame is
  degenerate. The fix that stopped walls rotating the stick is what made top-down free.

### MEASURED — `harness/perspective-shots.mjs`, 7 checks
chase 1.6 m up / 2.9 m back · wide 2.5 / 4.7 · iso 5.5 up, 37° down · top 9.0 up, 81° down.
Roof off for both overhead rigs and back on for both ground rigs, 13/13 ceilings hidden.

### ⚠️ FLAGGED FOR JOHN — the overhead views are a god-view
`lid` is a **forbidden URL parameter** (`party-follow` F4 control L4) with the note *"the house
with its ceilings off IS a god-view"*, and `party-loop.md` says *"limited, produced, not
god-view"*. With the roof off at 9 m the room can see over walls into adjacent rooms — and the
hunter has a visible body. John asked for the see-through roof explicitly, so it ships; but the
consequence is a locked design rule and the mitigation (take the ceiling off only the room the
runner is in) is a decision for him, not a tidy-up.

---

## Round 9 — the ballroom asset reaches Prime Time (John's ask, third time of asking)

*"I have asked it a few times to put the assets as we worked on it with much more details and
furniture into the Prime Time … it seems it still hasn't done it."*

### WHY IT KEPT NOT HAPPENING — a defect class, not an oversight
**There was nothing to find in the ballroom files.** `ballroomFixtures` in
`src/lighting/ballroom-rig.js` was written, shipping and correct — and mounted in exactly ONE
place: `src/views/game.js`, the survival view, behind an `?estate=port` flag. The party night
builds the same house through the same `buildTestRoom` and simply never called it. Anyone
searching `world/ballroom-*` for the missing furniture would search forever.

### MEASURED FIRST — `harness/_ballroom-diff.mjs`
"Many more objects" is a countable claim, so it was counted rather than argued about: the asset
ran **23 lights**; the ballroom the whole show is set in ran **6**, and photographed as a brown
box. (⚠️ The same tool over-reports "missing": the playable path MERGES the fixtures into
`fixture:brass/wax/crystal`, so a name-by-name diff calls 873 crystal pieces absent when they are
present and merged. Triangles are the honest number — 455k → 598k.)

### BUILT — John chose B, the night reading
- **The wire**, off the room's own `orderPlan` and its baked `estate` materials, so the party
  room is the asset rather than a near-miss of it. Non-fatal: a practical that throws cannot stop
  the show opening. W37/W37c/W37d.
- **`points: 3`, and that is the one argument that differs from `game.js`.** The rig defaults to
  ZERO — the survival ballroom already owns direction from a shadow-casting key across the
  colonnade. Prime Time's ballroom is the HERO SET (lobby, intros, recap, debrief, reckoning,
  vote — most of the night) and had no such key. `SPEC` is this project's own ordered answer:
  centre chandelier core, musicians' gallery, window wall. W37a is the control, because the rig
  hands the meshes back regardless and a build that forgot `points` would hang three unlit props
  in a dark room and pass any check that counted objects.

### DELIBERATELY NOT PORTED — option A, and it is a different show
The asset's look is **daylight**: a 19,400-intensity shadow-casting spot through five windows,
three directionals, light shafts, dust sheets, crates and paper scatter — a sunlit DERELICT hall.
Prime Time is a night broadcast in a working venue with a rug and eight chairs. John: *"Same
geometry, same textures, same layout, same fixtures — but the chandeliers and sconces are the
light source instead of the sun."* W37b pins the absence so a later round has to choose it rather
than drift into it.

---

## Round 10 — the ballroom port, investigated properly (six parallel agents)

John, after the first port attempt: *"There are so many features that are visible in the asset
that I aren't viable in the game… Why are there so many things that didn't get ported over from
the asset and how can we verify that we actually have everything?"*

### THE INSTRUMENT FIRST — `?campose=` and `harness/ballroom-compare.mjs`
The show camera re-aims every frame, so nobody could stand in the same spot in both rooms. "Is it
ported yet" was therefore answered from memory, and answered WRONGLY at least three times,
including once by me: I counted lights and object NAMES, declared the ballroom done, and missed
every item on John's list. `?campose=x,y,z,tx,ty,tz[,fov]` pins the show camera the way
`shoot.mjs --cam` already pins the asset's; `ballroom-compare` shoots both from seven identical
stations, resolved as FRACTIONS of each room so the different room sizes cannot fake a defect.
Gates F12–F12c. Sheet: https://claude.ai/code/artifact/b58b60cb-f79d-4852-a5f4-3a5bed7225a3

### 🚨 THREE OF JOHN'S SIX ITEMS WERE NOT WHAT THEY LOOKED LIKE
Each of these would have been "ported" by a builder working from the description alone, and none
of the three fixes is the one the description implies.

- **The curtains are IDENTICAL in both rooms.** Three flat boxes per window, emitted by the shared
  `ballroom-order.js` — the showcase authors no curtain geometry at all. What reads as folds in
  the asset is SHADOW: the showcase's drapes cast, and `room.js` blankets `castShadow = false`
  over every order mesh. Fix is a shadow flag and a surface map, not geometry. ⚠️ Fold geometry
  was tried once and REVERTED: it broke the showcase's own darkest-decile gate, which has 0.3 of
  headroom and lost 0.35. Any fold work must be game-only and default off.
- **The wall panels are buried in BOTH rooms.** Measured: every panel piece sits between −0.12 and
  −0.048 m inside a 0.30 m wall. They have never rendered anywhere; the showcase's own header
  describes an ambition, not a picture. `kit.js` already ships the cure (`raised: true`, field
  proud at +0.048) and only one unrelated view uses it. It is also **32% fewer vertices** than the
  sunk path and zero new draw calls.
- **The big archway is not missing — it is a doorway.** The game builds three arches from real
  connectors at 1.90 × 2.72 m; the showcase's is 5.20 × 5.20. Same code, 2.7× narrower. Widening
  the opening is a GAMEPLAY change (pathfinding, instancing groups, chase sightlines) and must not
  be done. The answer is a decorative BLIND arch at 5.2 m drawn around the real doorway — zero new
  draw calls, and `solid: false` already makes `clashes()` clear the boiserie across the span.

### WHAT IS GENUINELY ABSENT, AND THE CHEAPEST FIX FOR EACH
- **The floor wood is half the brightness the showcase measured.** The showcase swept 1.6/2.0/2.4×
  and shipped 2.0×; the game uses `parquetMat()`'s bare default. One line, biggest single win.
- **The marble border.** Not a two-plane sandwich in the game — a RING of four slabs over the
  existing floor's rim, +1 draw call, border snapped to whole marble squares so a generated room
  never shows a half tile against the wall.
- **The two mirrors flanking the arch.** The module can already place a mirror anywhere at any
  rake; `room.js` simply never passes `mirrors.plates`. ~15 lines, +0 draw calls (they merge into
  the `pier-mirrors` mesh that already exists). Ship them flat — the showcase's 9° rake exists only
  to aim a planar reflection we are not porting.
- **The outside of the windows ALREADY EXISTS AND IS SWITCHED OFF.** `src/game/exterior.js` builds
  a full walled yard — ground, boundary wall, piers, hedges, trees, sky — as ONE merged
  `MeshBasicMaterial` mesh, one draw call, no lights. Three specs are already positioned on the
  ballroom's own facades. They are invisible because a yard only shows once the player has SMASHED
  that wall panel. The work is a night palette and an always-on decorative instance.

### NOT PORTING — planar reflections, and the reason is not budget
The showcase's floor and mirror reflections cost *zero per frame* because that camera never moves:
one render at build time, frozen. The showcase's own header says so and says what happens
otherwise. In a walkable room each becomes a full scene re-render **every frame**. The room is
already at 2.24–2.28 ms against a 1.39 ms budget.

### ⚠️ TRAPS RECORDED FOR WHOEVER BUILDS THIS
- **The hard black point.** The grade does `(col − 0.5)·contrast + 0.5` BEFORE the toe, so anything
  under scene-linear 0.030 clamps to literal zero — no light, hemisphere or `up` term recovers it.
  A "dark night exterior" authored naively delivers exactly the black rectangle it was meant to
  replace. This already cost two rounds on the vestibule, where forcing a mesh to pure white still
  only read 43–63. Check DELIVERED pixels, never authored hexes.
- **`p.setInterconnect(null)` must never appear in `room.js`**, even inside a comment — `party-warm`
  W16c asserts its absence.
- **Two agents contradicted each other** on whether `views/game.js` assigns `scene.environment`.
  Two verified it now does (via `estate()` → `_studio.js`); one trusted a stale comment saying it
  does not. That comment is the premise a material decision is documented on. Verify before relying
  on either — this is exactly how a false premise gets inherited.

---

## Round 7 — the reaction badges (critic → design → build)

John's partner: *"the emotes could use a little bit more expression through floating symbols near
them… red question marks around the 'sus' reaction, exclamation marks around the shock,
frustration squiggles or a thumbs down for boo and clapping hands for the clap. They should all be
slightly animated."* Gates: **26 suites, 1094 assertions, green**, plus `harness/react-fit.mjs` at
13/13 outside the chain.

### BUILT — the two defects the critic found first
- **The reaction strip was falling off the bottom of the television.** Measured on the real skin:
  at 1920x1080, 24px of every 74px chip sat below the screen edge and the player's **NAME was not
  on the television at all**; 39px and no names at 1280x720. Nothing looked broken because the run
  beat hides its overflow — it simply cut the bottom off the feature whose entire premise is that
  a reaction is attributed. The picture now takes what is LEFT OVER instead of taking 90% and
  letting the rest fall off: 90vh at 4K, 83 at 1080p, 75 at 720p, nothing cut at any of five
  resolutions. Gate `party-warm` W44/W44b for the shape; `harness/react-fit.mjs` F1–F4 measures it
  in a real browser (out of `gates:party`, which runs with no `npm install`).
- **The strip rebuilt all six faces whenever one person reacted**, restarting every entrance
  animation — so it juddered continuously under the run picture, before a single symbol existed.
  Now one arrival touches one chip, and the row is ordered by **seat** rather than by recency so
  nobody's face moves when someone else reacts. W45.

### BUILT — the badges
- **One filled tile, top-right, glyph knocked out.** Rendered both ways: three scattered glyphs
  are 5px of coloured dust at sofa distance, where one 34-unit tile still reads. At 34% scale the
  badged row is four distinguishable reactions; the unbadged row is six identical blue blobs.
- **Clap and boo are one chevron mirrored** — John's call, replacing a level meter that read as
  signal strength before it read as applause. The pair now reads as one control with two
  directions. R65 asserts the reflection (every matching pair sums to 42).
- **Sus keeps the `?`; shock gets a spark.** R60–R64.
- **Idle never gets a badge, structurally** — it is derived from the mood, so no caller can turn
  it on. Seven of the nine mounts are hard-coded idle. R61.
- **Motion is about one pixel**, transform-only, every loop resting at both ends so a chip
  replaced mid-flight lands where it already was. W46.
- **The night screen finally has a `prefers-reduced-motion` block** — it had none, while already
  running three unguarded animations. W46b, and F0 checks it in a real browser.

### PUSHED BACK
- **Red question marks and exclamation marks.** `--night-bad` already means *taken / dark /
  Production*, and a red `!` above a head is this game's **locked** word for a nominee — a mark the
  room reads ninety seconds later at the Reckoning. The `?` shape survived; the red did not, and
  shock got a spark instead of a `!`. R64 pins sus off red.
- **Thumbs-down and clapping hands.** This character has no hands anywhere in its art — a helmet,
  two pods and a lit screen. A cartoon hand would be the only human body part on the screen and
  would look borrowed, because it would be. Chevrons and a spark say the same things in the
  robot's own voice.
- **"Floating symbols AROUND the head"** in the literal sense. The viewBox cannot grow (eight
  faces mount at once in the lobby, so no ids and no wider box), and the clear margin around the
  helmet is 5px at strip size. The tile overlaps the crown, which is what a status pip does anyway.

### NOTED
- Fixing `.run-frame` broke **W17a**'s anchor: `.run-frame {` also matches inside the new
  `.night.on-run .run-frame {` override, so it silently extracted a 45-character rule and failed
  reporting CSS that was correct. Anchored on the indent, with the reason recorded on the line —
  that is now the third distinct way this one extraction has gone wrong.
