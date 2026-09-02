# PRIME TIME — the phone client

Spec for the browser phone controller. Companion to [`web-prototype/docs/design/party-loop.md`](../../web-prototype/docs/design/party-loop.md) (the Expedition), [`rrr-social-deception-mode.md`](./rrr-social-deception-mode.md) (the round around it) and [`rrr-prototype-audit.md`](./rrr-prototype-audit.md) (A2: touch is a from-scratch build).

**Scope.** Everything a player's phone shows and sends. Not the TV, except where the TV owes the phone a contract (§2.1, §3.4).

---

## 0. The two decisions that shape everything else

**D-P1 — The runner's phone is a controller, not a viewport. The runner's camera lives on the TV.**

**RATIFIED BY JOHN 2026-08-19 as bible D13.** This was written as a flagged deviation; it is now the decision, and it overrides `party-loop.md`'s build-list line *"Phone first-person + touch."* The five reasons and the overturning measurement are kept below because the measurement still stands.

*(Amended 2026-09-02: what the TV shows is a **produced follow** — chase inside the ballroom, top-down over the runner's own rooms outside it, a crane between — not a first-person picture; that word left the spec. And §3's move scheme is superseded: since 2026-09-01 the runner **auto-walks the guide's pin** and the stick is a **lateral dodge only** with HOLD to hide. See §3's banner and `rrr-social-deception-mode.md` §5.7.1. Gates: `party-follow` F11i, `runner-intel`.)*

1. **Boot cost.** `player.js` documents a **30–60 s shader compile** on desktop. The Expedition is **90 s**. A phone joining by QR with no install and no warm cache cannot pay that, and a mid-range Android in Safari/Chrome pays more.
2. **Draw budget.** The budget is **≤625 calls** and it is a *single-player desktop* budget; audit risk **A1** already flags eight customised robots against it. Adding an eighth renderer on the weakest hardware in the room is not a tuning problem, it is a different program.
3. **Nothing on the runner's screen is secret.** The show *is* the runner's run. The only private view in the design is the guide's, and that is 2D and cheap (§3).
4. **The party.** Eight people watching one person stare into their own phone is the failure mode this whole pivot exists to avoid.
5. **Motion sickness.** A phone held 30 cm from the face, showing a bobbing corridor, is the worst possible display for it. Keeping world motion on a TV 3 m away removes risk **R8**'s largest term for free.

The runner therefore plays the way a console player does: **eyes on the screen, thumbs on a pad they never look at.** Every control below is designed to be operable with the phone face-down-ish in the lap.

*What overturns this:* at M1b, measure cold boot-to-playable of a stripped runner scene on the worst phone in the test matrix (§7). Under **8 s**, and phone-rendered first person becomes a v2 A/B. Above it, this decision is permanent.

**D-P2 — Input is level-based state at 20 Hz, with acked edges for one-shots.** Grounded in `player.js`'s two documented input bugs (`once` latch, `clearInput`). See §4.

---

## 1. Screen inventory

| # | Screen | Phase | Who |
|---|---|---|---|
| 1 | **JOIN** | pre-game | everyone |
| 2 | **LOBBY + TRAINER** | pre-game | everyone |
| 3 | **ROLE CARD** | on deal, recallable always | everyone |
| 4 | **SEATED** (reaction bar) | default resting screen | everyone alive |
| 5 | **CLAIM** | seated, any time | everyone alive |
| 6 | **VOTE** (3 variants) | casting / nomination / verdict | everyone alive |
| 7 | **RUNNER** | Expedition | 1 |
| 8 | **GUIDE** | Expedition | 1 |
| 9 | **DEAD / CHAT** | after being taken or executed | the dead |
| 10 | **PRODUCTION PANEL** | persistent tab, any phase | evil |

Screens 3, 5 and 10 are **tabs over whatever is current**, not phases — a player must be able to re-read their role or check a teammate's claim draft mid-vote. 4 is the home state; the phone returns to it whenever nothing else is asked of it.

**Global chrome.** A 44 px top strip: room code, your robot glyph + name, phase name, and a phase clock that is a **draining bar, not digits** (readable at a glance, drunk, in the dark). Nothing else ever lives in the top corners — see §6.

---

## 2. The screens

### 2.1 JOIN
Phone camera reads the TV's QR → a URL carrying room code and a fresh reconnect token. One scrolling page, no steps:
- **NAME** — 12 chars, prefilled from `localStorage` on a rejoin.
- **ROBOT** — a 3×3 grid of **silhouettes with distinct accessories** (antenna, crest, hunched, one-armed…), each with a name under it. Colour is a secondary swatch, never the identifier (§6).
- **HANDEDNESS** — a two-state toggle, `LEFT` / `RIGHT`, that mirrors every later layout. Default right.
- **FIRST TIME?** — the bible's §12 toggle. Adds one hint line per phase.
- One full-width **JOIN** button. If the room is full (8), the page says so and offers WATCH (no controls, chat only).

*Cheap v1:* type a 4-letter room code; no robot picker (server assigns a silhouette); no handedness (fixed right).

### 2.2 LOBBY + TRAINER
Top half: roster of joined players as silhouette chips, greying in as they connect, plus "waiting for host". Bottom half is the **trainer**, and it is the tutorial the bible's §12 asks for, adapted to D-P1: a black card with the live control layer on it and three prompts in sequence — **GO** (push up), **STOP** (let go, and the noise ring shrinks to nothing), **TURN TO THE ARROW** (push left/right until a marker centres). Each completes on success, no timer, replayable. It takes ~15 s and teaches throttle, silence and steering with no words about any of them.

*Cheap v1:* a static labelled diagram of the pad and a DONE button.

### 2.3 ROLE CARD
Full-bleed card, one line of rule text at 24 px, the role name at 34 px, and the word **GOOD** or **PRODUCTION** spelled out (never colour alone). It is **hold-to-reveal**: the card is blurred until a finger is held on it, so a neighbour's glance at an unattended phone reveals nothing. Releasing re-blurs after 400 ms. A persistent **ROLE** tab in the bottom strip reopens it in any phase.

*Cheap v1:* same card, no blur, shown once and reachable from a text link.

### 2.4 SEATED — the resting screen
The screen six of eight players are on for most of the night, so it is deliberately almost empty.
- Upper third: **YOUR CLAIM**, as it reads on your TV nameplate, with a pencil affordance → §2.5.
- Lower two thirds: the **reaction bar** — four buttons in a 2×2 grid, each ≥ 100 × 100 px, each a **glyph + word**: 👏 CLAP · 👎 BOO · ❓ SUS · ‼ SHOCK. Tap fires immediately with a local flash and a haptic; no confirm, no cooldown beyond a 500 ms per-button rate limit. The TV aggregates.
- During **DEBRIEF** the whole screen is replaced by a card reading **PHONES DOWN — TALK**, with only the reaction bar left live. This is risk **R3**'s mitigation and it belongs to the phone, not the TV.

*Cheap v1:* the four buttons, no claim strip, no phones-down card.

### 2.5 CLAIM
A list of 8 preset one-liners ("Sound Guy", "I was watching the north hall") plus a free-text field capped at 24 chars. Typing updates a **draft** that is transmitted continuously (evil's panel reads drafts — §2.10) and a **PUBLISH** button that pushes it to the TV nameplate. Draft vs published is shown as dotted vs solid underline, never colour.

*Cheap v1:* presets only, publish on tap, no drafts (and evil's panel shows published claims only).

### 2.6 VOTE — three variants, one layout
A grid of player cards (silhouette, name, published claim, alive/dead). Tap selects, the card raises and everything else dims; a full-width **hold-to-confirm** bar at the bottom fills over 600 ms and locks in. Locked state shows your choice and a small UNDO that is live until the phase clock's last 5 s.
- **CASTING** — pick the pair. Two selections allowed; the bar reads `CONFIRM PAIR`.
- **NOMINATION** — one selection, plus a full-width `NOMINATE NOBODY`.
- **VERDICT** — the nominee is shown large; two buttons, `EXECUTE` and `SPARE`, plus `ABSTAIN`. Hold-to-confirm as above.

Hold-to-confirm rather than tap is a drunk-hands decision: a mis-tap that eliminates a friend is the single most expensive input error in the game.

*Cheap v1:* tap to vote, tap again to lock, no undo, no dimming.

### 2.7 RUNNER
See §3 in full. Layout: nothing above the bottom 45 % of the screen except a 3-line **visor strip** (task name, distance-to-objective as a coarse bar, and the current contextual action's name). No 3D. The screen is dark grey, not black — a black phone screen in a dark lounge reads as "my phone died".

### 2.8 GUIDE
See §4 in full.

### 2.9 DEAD / CHAT
Per **C1**: no mansion UI, ever. A chat column with a 24 px composer and a **TIP** button that submits to the TV's tip crawl. Above the composer, one line: `TIPS SHOWN: 3 · TRUE: 2` — the bible's stated truth count. The dead player's reaction bar stays live (the audience still reacts). No map, no vote, no controls.

*Cheap v1:* chat only, no tips, no truth count.

### 2.10 PRODUCTION PANEL (evil)
A tab, not a screen — available over any other screen via a persistent bottom-strip button that is **visually identical to the ROLE tab for good players** (an observer must not be able to tell from across the room which tab a player just opened). Contents, read-only, per §7.5: each teammate's name, true role, **live claim draft**, and remaining once-per-game abilities. No input controls of any kind, no chat.

*Cheap v1:* teammate names + roles only, published claims, refreshed on phase change.

---

## 3. The runner control scheme

> ⚠️ **SUPERSEDED 2026-09-01 — kept for its measurements.** The steer-and-go stick below was the
> pre-lock scheme. The locked controls: the runner **auto-walks the guide's pin** one door at a
> time; the stick is a **lateral dodge only** (no throttle, no yaw, no speed choice); **HOLD hides
> behind furniture**, and there is no hiding in an open hall; the six fake voice buttons are gone.
> `src/game/runner-intel.js` is the one owner. Gates: `runner-intel` RI20, `expedition-jobs` J7.
> The noise-ring maths and the detent table stay below because their numbers are still the stealth
> model's numbers, and kept history here has caught real spec errors before.

### 3.1 The scheme: one thumb, steer-and-go
**A single floating stick** in the handedness-chosen bottom corner, plus **one contextual action button** and **one look-back tap target**. That is the whole surface.

The stick is **not** a strafe stick. It is a car:

| Axis | Meaning | Range |
|---|---|---|
| Up / down | **throttle** — forward, or backward at half rate | detented, see below |
| Left / right | **yaw rate** — the body turns | eased, capped at `MOVE.turnRate` (3.4 rad/s) |

Camera yaw *is* body yaw. There is no independent look, no pitch, no strafe. This is legitimate because **the hammer is automated** — nothing in the runner's verb set requires aiming, so a second look axis buys nothing and costs a thumb.

**Throttle is detented, and the detents are the stealth model.** `HUNTER_SENSE` says a walking robot makes ~0.49 noise and is heard at ~7 m, and that below `hearFloor` you are inaudible at any range. So speed choice is the entire stealth verb, and it must be a *sustained position*, not a held modifier:

| Deflection | State | Speed | Feel |
|---|---|---|---|
| 0–18 % | **STILL** | 0 | silence; the ring collapses |
| 18–45 % | **CREEP** | ~0.9 m/s | one haptic tick entering |
| 45–85 % | **WALK** | `MOVE.walk` 2.55 | second tick |
| 85–100 % + push past a resistance step | **RUN** | `MOVE.run` 5.20 | third tick, and the ring flares |

The run detent needs a deliberate extra shove, so panic-sprinting is available in one motion but never accidental.

**The stick is the noise gauge.** A ring around the stick's origin grows with `Player.noise`, in real time, locally. No number, no label. This teaches the game's central risk model without a tutorial line, and it is the reason the stick must be looked at *occasionally* but never continuously.

**ACTION** — one large button (≥ 96 px) on the opposite side, contextual and single-valued: the host publishes at most one available action at a time (`SMASH`, `USE TERMINAL`, `HIDE`, `OPEN`), and the button shows its name or is greyed. It is **hold-to-commit**, with a filling ring; releasing early cancels. Hold rather than tap because the automated hammer wants a sustained commitment, not a mash, and because a hold cannot be fired by a pocket or a stumble.

**LOOK BACK** — a small tap target above ACTION. One tap yaws 180° over 0.4 s, eased. This is the only thing free-look was really needed for in a corridor horror game, and it costs one tap instead of a thumb.

### 3.2 Alternatives rejected
**Twin-stick (left move, right drag-to-look).** The obvious port of mouse-look, and wrong here. It needs two hands, so it cannot be played while holding a drink; a floating right-hand look pad has no origin the thumb can find without looking, so drunk players spin; pitch is dead weight given an automated hammer; and `player.js`'s own non-locked drag path already shows the trap it inherits — a drag and a tap share one surface, so `DRAG_SLOP` has to arbitrate, and every attempt to turn round risks firing the verb. Steer-and-go has no such ambiguity because turning and acting are physically different controls.

**Tilt-to-steer (gyro).** Rejected harder. iOS requires a `DeviceOrientationEvent.requestPermission()` user gesture that a novice will decline or not understand; the neutral pose drifts; and in a lounge people constantly turn their bodies to talk, which is exactly the gesture the control would read as steering.

**Junction-swipe rails** (auto-walk, swipe at intersections). Genuinely good, and *not* rejected — it is the **cheap v1**, the accessibility mode, and the degraded mode on a bad connection (§5). It is not the primary because it removes the speed choice, and the speed choice is the stealth game.

### 3.3 Contract the TV owes the runner
During EXPEDITION the Broadcast Director **must hold a drivable frame** — behind-and-above the runner, or the runner's visor feed — and must never cut away while the runner has input. Cutaways to reaction shots, the seated circle or another camera are permitted **only** in windows where the host has frozen or auto-driven the runner. Without this, D-P1 is unplayable.

---

## 4. The guide screen

**A 2D vector plan drawn on a `<canvas>`, not the 3D flyover.** The flyover in `views/game.js` is a perspective render of the whole envelope at once, with every space resident — the one figure in the codebase explicitly reported as *outside* the 625 draw budget. Shipping it to a phone reintroduces every cost in D-P1. The plan tables that `genplan.js` → `spaces.js` already produce (rects + door coordinates) are all a map needs.

**Layout.**
- **Orientation is locked to plan orientation** — screen-up is world `−Z`, screen-right is `+X`, exactly as the flyover chose, so the guide, the map designer and anyone else describing the house cannot disagree about "left". The map **never rotates**, at any zoom, for any reason (rotation is the single largest source of guide-to-runner direction errors and of nausea).
- **Two zooms, one toggle.** Double-tap swaps `LOCAL` (the runner's room plus every room one door away, auto-followed) and `HOUSE` (whole envelope, fitted). No pinch, no pan — a guide fumbling a pan gesture under time pressure is worse than a fixed frame.
- **Rooms** are filled rectangles with the room name set in 16 px caps, always horizontal, always inside the rect, dropped when it does not fit rather than shrunk below 12 px. Doors are gaps in the wall lines. Breached walls draw as a dashed gap.
- **Marks are shapes first.** Runner = filled triangle pointing along heading. Hunter = hollow ring, its stroke thickening with `awareness`. Objective = square. Each has a one-word label. Colour is redundant (§6).
- **Plain-language readout**, one line under the map, 22 px: `HUNTER — 2 ROOMS, YOUR LEFT`. The guide's job is to *talk*, so the map minimises reading.

**Fidelity is a balance dial, and it must be imprecise on purpose.** The hunter mark updates at 2 Hz with a positional blur of roughly half a room (`rules.js` → `GUIDE_FIDELITY`). A guide who can see the hunter to the metre cannot plausibly say "I thought it was clear", and the deniable lie is the entire reason the guide role exists (audit §5.3). Precision here directly costs the social game.

**It must never leak.** Three separate leaks, three separate answers:
1. **To the TV.** The host process must never receive hunter position or the guide payload at all. Extend the existing discipline: `net/server.mjs` already refuses to send StageHealth to clients because *"it would leak how close a wall is to opening"*. Guide payloads are per-socket, filtered at the server, and the TV's socket is not on the list. Verification hook **V12**: a gate that asserts the TV socket's inbound message log over a full round contains no hunter field.
2. **To the room.** The guide's phone is a physical object in a lounge. Screen brightness is dropped to 60 % and a **SHIELD** button blanks the map to a plain "GUIDING" card while held — for when someone leans over. The lobby tells the guide to angle away. Measure the leak rate (§7).
3. **To the runner.** The runner's phone never receives the map payload, only the visor strip.

*Cheap v1:* rooms as unlabelled rectangles, the runner triangle, the hunter ring, `HOUSE` zoom only, no readout line, no shield.

---

## 5. Latency and feel

**Local, never waits for anything** — stick visuals and detent haptics, the noise ring, button press states, the hold-to-commit fill, screen transitions, reaction-bar flashes, claim text editing, map redraws from the last snapshot. If any of these wait on a socket, the phone feels broken at 80 ms.

**One hop, not two.** Phone input goes to the **host**, which is authority for the run and renders the TV. There is no phone→server→host relay for movement.

**Wire model (D-P2), and it comes straight out of `player.js`'s two documented input bugs.**
- **Continuous input is a LEVEL snapshot at 20 Hz** (matching `client.js`'s `sendHz`): absolute stick vector, absolute button-held flags, a monotonic `seq`. Never deltas, never edges. A dropped packet self-heals on the next one 50 ms later. This is the same reasoning that made `mouse.down` a level test.
- **One-shots are acked edges.** The completion of a hold-to-commit, a look-back tap, a vote lock-in, a reaction. Sent with `seq`, retransmitted every 100 ms until acked, deduped by `seq` at the host. This is the `once` latch problem — an 80 ms press falling between two frames — moved onto a lossy network, and it has the same fix.

**Waits for the server, and says so:** vote tallies, pair selection, the role deal, claim publication to the nameplate, elimination results, action availability. Each shows a local pressed/pending state instantly and a spinner only after 400 ms.

**Degradation ladder.**

| Condition | Phone | Host |
|---|---|---|
| RTT < 150 ms | nothing | nothing |
| RTT > 250 ms or 3 snapshots missed (150 ms silence) | thin amber edge glow | begins smoothing |
| 600 ms silence | edge glow solid, `RECONNECTING` in the strip | **safe hold**: throttle ramps to 0 over 250 ms, heading held |
| 3 s silence | full-screen `RECONNECTING`, controls dead | **autopilot**: robot stands still; TV shows a diegetic `SIGNAL LOST` caption |
| Reconnect | token in URL restores identity, role, screen and votes | resumes; requires a **re-touch** before any movement (§6) |
| Guide's connection degrades | last map snapshot kept, greyed, stamped `STALE 3s` | — |

**Safe hold is a stop, not a coast**, and that is a rules decision: standing still is silence in `HUNTER_SENSE`, so stopping is the least unfair thing a network hiccup can do to a runner. A runner who walks into the hunter because of someone's wifi will be blamed as a saboteur, which poisons the social game.

**On a genuinely bad room** (a carrier hotspot, 8 phones on a congested 2.4 GHz AP), the host may drop the runner to **junction-swipe rails** (§3.2) for the rest of the Expedition — playable at 2 Hz, announced on the TV as a production cutaway so nobody reads it as cheating.

---

## 6. Accessibility

- **One-handed.** Every interactive element lives in the bottom 45 % of the screen. The runner stick floats — it originates wherever the thumb first lands in its half, so reach never depends on phone size. The `LEFT`/`RIGHT` handedness toggle mirrors every layout including the vote grid and the guide readout. Nothing the game requires is ever in a top corner.
- **Colour-blind safety.** Every state carries shape, position or a word. Robots are silhouettes with accessories (bible §12). Alignment is spelled `GOOD` / `PRODUCTION`. Guide marks are triangle/ring/square. Reaction buttons are glyph + word. Draft vs published claim is dotted vs solid. **No information anywhere is carried by hue alone** — verification hook: render every screen through a greyscale filter in CI and assert each state is still distinguishable.
- **Text size.** 17 px minimum body, 22 px for anything read under a phase clock, 24 px for role text. Everything in `rem` against the browser's own font scale so OS text-size settings work. **Do not set `user-scalable=no`.** `touch-action: none` is applied to the runner and guide control layers only, so pinch-zoom survives everywhere it matters.
- **Motion sickness.** The phone shows no world motion at all (D-P1) — the largest mitigation available, taken by default. The guide map never rotates. Yaw rate is capped and eased, so the view cannot spin. If phone-rendered first person ever ships as a v2, it ships with a static visor frame, no head-bob, and a fixed FOV, and it ships behind a per-player toggle.
- **Haptics are redundant, always.** `navigator.vibrate` does not exist in iOS Safari. Every detent tick therefore has a visual twin (the ring steps, the stick collar snaps). Nothing is communicated by vibration alone.
- **No audio required on the phone.** Sound lives on the TV. The phone must be fully playable muted, because half a party has their phone on silent.
- **Screen lock, and a call coming in.** Request a **Screen Wake Lock** whenever the player is runner or guide, released otherwise (battery). Where the API is missing, fall back to a looping muted inline video, and if that fails, accept it and rely on the recovery path — which must work regardless:
  - `visibilitychange` → hidden, `pagehide`, or `touchcancel` (which a call banner fires) → the phone sends an explicit `pause` and stops sending snapshots. The host applies safe hold immediately.
  - **On return, input is cleared and gated behind a re-touch.** The stick resets to zero and no movement is transmitted until the player lifts and re-places a finger. This is `clearInput(true)` — *"movement input continue permanently after an escape"* — reproduced on a phone by a `touchcancel` with no matching `touchend`. It will happen every time someone gets a call, and without the gate the robot walks into a wall until the round ends.
  - The screen returns to exactly the phase the game is now in, not the one it left.

---

## 7. What must be measured, with real phones, in a real lounge

Nothing here is answerable on a desktop with device emulation.

**Matrix (minimum five handsets):** an iPhone SE-class small screen on iOS Safari; a 2–3 year old mid-range Android on Chrome; one iPad (no Pointer Lock — the case `player.js` already names); one phone in a thick case with a cracked screen; one phone on cellular rather than the house wifi. Plus eight simultaneous connections on one domestic AP.

| # | Measure | Instrument | Target |
|---|---|---|---|
| M1 | QR → in lobby | stopwatch, per player, first ever attempt | median < 25 s, p90 < 45 s |
| M2 | **Input→pixel latency** | film phone and TV in one 120 fps frame, count frames from thumb move to TV response | median < 80 ms, p95 < 150 ms |
| M3 | Cold boot-to-playable of a stripped runner scene, worst handset | in-page timestamp | < 8 s decides D-P1's v2 (§0) |
| M4 | Snapshot loss rate, 8 phones, 10 min | host-side `seq` gap counter | < 1 %, no gap > 3 |
| M5 | Screen auto-locks during one 150 s debrief | count, per handset | 0 |
| M6 | Time-to-first-move, novice runner | video | < 5 s |
| M7 | Seconds a runner spends stuck against geometry | host telemetry | < 8 s per 90 s Expedition |
| M8 | **Second-screen rate** (bible R2) | film the room; count seconds of eyes-off-TV per non-acting player | < 15 % of Expedition |
| M9 | **Guide leak** | film the guide's seat; count neighbour glances that could read the map | 0 per round, or SHIELD needs rework |
| M10 | One-handed rate | count players holding the phone one-handed during the Expedition | > 70 %, else the layout failed |
| M11 | Nausea, after two Expeditions as runner | 1–5 self-report | mean < 1.5 |
| M12 | Detent legibility | ask each runner, unprompted, "how do you go quiet?" | > 80 % answer correctly without being told |
| M13 | Mis-votes | count UNDOs and post-hoc "I meant to tap X" | < 1 per game |
| M14 | Lounge conditions | lux meter, TV distance, TV text legibility at that distance | record, don't target |

**Bench gates to add alongside the existing 164**, so the lounge test is not the first place these fail: a headless Playwright gate driving the runner control layer with synthetic Pointer Events that asserts (a) safe hold zeroes throttle within 250 ms of silence, (b) the re-touch gate blocks movement after a synthetic `touchcancel`, (c) an unacked edge retransmits and is deduped by `seq`, (d) every screen survives a greyscale pass, and (e) **V12** — the TV socket's inbound log contains no hunter field for a whole round.

---

## 8. Open questions

1. Does the Broadcast Director's cutaway contract (§3.3) survive contact with a director that wants reaction shots? If not, D-P1 needs the phone visor to carry a low-fidelity heading cue.
2. `GUIDE_FIDELITY` blur radius — a balance number nobody has played yet.
3. Whether the dead keep the reaction bar (§2.9). It is not a mansion UI, so C1 permits it, but it does hand the dead a live signal.
4. Whether CASTING should let you vote for yourself.
