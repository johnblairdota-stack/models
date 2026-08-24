# PRIME TIME — Build Brief

Synthesis of seven system specs, 2026-08-19. The one document to read before writing party-mode code.

| Spec | Owns |
|---|---|
| [`rrr-social-deception-mode.md`](./rrr-social-deception-mode.md) v0.4 | The design bible — decisions D1–D12, pillars, the round |
| [`rrr-prototype-audit.md`](./rrr-prototype-audit.md) | What exists in `web-prototype/` |
| [`rrr-task-deck.md`](./rrr-task-deck.md) | The five tasks |
| [`rrr-roles.md`](./rrr-roles.md) | The role bag |
| [`rrr-broadcast.md`](./rrr-broadcast.md) | The Director |
| [`rrr-netplay.md`](./rrr-netplay.md) | PartyKit, authority, the entitlement matrix |
| [`rrr-phone-ux.md`](./rrr-phone-ux.md) | Every phone screen |
| [`rrr-social-round.md`](./rrr-social-round.md) | The round, the vote, the log, the Reunion |
| [`rrr-gates.md`](./rrr-gates.md) | Verification — supersedes bible §16 |

---

## 1. Three showstoppers — fix before any party code ships

Each was found by reading the actual code, each is cheap now and a migration later.

### S1 · The cast seed leaks the entire cast  ·  ✅ BUILT

`run.js:43-48` establishes the project's doctrine: *"the exit is never transmitted and never negotiated — both ends derive it from one integer."* Correct for geometry. **Fatal for roles.** One published seed plus `seededPick` recomputes who is evil.

**Fix:** `castSeed` lives only in the PartyKit Durable Object and is a *different integer* from `worldSeed`. The world seed stays public exactly as today.

### S2 · "Taken" does not exist  ·  ✅ BUILT

The whole party loop rests on a runner being taken by the Hunter and removed from the game. `_attack` only detaches limbs (`hunter-ai.js:1114`). There is no death, no removal, no terminal state. The survival mode's limb economy is not a substitute — losing an arm is a setback, and the party mode needs an ending.

**Fix:** a new terminal `taken` state, authored as an event (the Hunter's best TV moment), with the limb economy explicitly bypassed in party mode.

### S3 · The guide's flyover is an oracle  ·  ✅ BUILT

`hunterMark.visible` is gated on `hs.inScene && !!hp` and nothing else (`game.js:2559`), drawn `depthTest:false` beside the hunter's hearing ring *and* sight cone. A guide holding that has a **zero honest error rate** — Task Contract T3 fails, and every task in the deck degrades from a deduction game into a lie detector.

It is a debug view. The audit read it as a game mechanic; that was wrong.

**Fix — and it is the best mechanic in this batch:** gate the hunter mark on **live camera coverage**. See §2.

---

## 2. The camera unlock is the spine

Three agents arrived at this independently. The unlocked-camera count is not one feature among several — it is the single resource four systems read from:

| System | What cameras do |
|---|---|
| **Objective** | Unlocking them is how good wins |
| **The guide's sight** | The hunter mark appears only where coverage is live — which is what gives the guide a **tunable honest error rate** instead of zero |
| **The Director** | Cameras are shots. More cameras, richer edit |
| **The audience** | The broadcast visibly improves as good players succeed |

Round one the guide is nearly blind and genuinely guessing. By round five they have real coverage and the runs get faster. **The objective feeds the information system rather than sitting beside it**, and the deniable lie exists because coverage is partial. Build the camera roster before the tasks.

---

## 3. One mechanism, three systems

The log envelope carries a `vis` field — `PUBLIC / CREW / EVIL / P:<id> / DIRECTOR / SEALED` — and it is the **sole input to the per-socket filter**.

- **Info isolation** is that filter, applied live
- **The Reunion** is the same replay with the filter off
- **The `party-isolation` gate** asserts against the same matrix, held as data

Three things I had specced as separate systems collapse into one. Design the envelope once, correctly, at M3 — everything downstream is a query.

---

## 4. What is reusable, verified

| Want | Already exists |
|---|---|
| FOLLOW shot | `ThirdPersonCamera` — `player.js:1628`, built `game.js:1449`, distance 3.1 / shoulder 0.44, already tuned |
| WORK shot | Work framing — `player.js:1502`, gated per-frame at `game.js:3084` |
| **The cut arbiter** | `hud.js:104-110/:340/:369/:375` — RANK / MIN_HOLD / defer / enqueue, **portable verbatim** one level up |
| Split-screen | `room.js:1436` `setViewpoints(views[])` |
| Rank-3 event source | `hunter-ai.js:238` `onCommit` |
| Automated hammer | `doorway-pick.js` — opens a walkable channel in 3 blows |
| Stealth model | `HUNTER_SENSE` in `rules.js` — sight fills awareness fast, sound cannot pass `soundCeiling` |
| Default-deny gate shape | `net/server.mjs:158-177` |
| "Never on the TV" is assertable | Flyover's named nodes, `game.js:2451-2460` |

**Discard:** `net/server.mjs` as a server — its entire wire is `broadcast()` (`:114-120`), `welcome` hands every joiner every peer's state (`:335-336`), `debug` is ungated (`:298-306`). Keep the doctrine, not the file. `src/net/client.js` likewise. `session-display.js` is 4 bytes — delete.

---

## 5. Build order

**Phase 0 — pre-wire constraints.** All three cost a migration if added later.

1. `party-isolation` gate — nine real sockets, full frame capture, deny-by-default matrix as data, four injected leaks every run; if a control passes the gate declares itself blind and exits non-zero
2. `party-anon` gate — T5: no payload or caption ever identifies a player in a failure event
3. `role-deal` gate — composition per player count

**Phase 1 — the three showstoppers. ✅ DONE.** `npm run gates:party` → **role-deal 14/0 · party-anon 10/0 · party-isolation 14/0 · party-taken 12/0 · guide-coverage 8/0.**

- **S1** `castSeed` is a separate integer, never on a wire, and has no matrix row — a frame carrying it fails I1 rather than losing a game.
- **S2** `src/party/taken.js`. Contact is terminal in party mode and the limb count is not consulted; `hunter-ai.js` is untouched and keeps its setback economy byte-for-byte. Worse than the audit said: `_attack` L1109 early-outs when no socket is occupied, so a four-limbs-gone player was *structurally* unkillable, not merely un-killed. T3 asserts that exact case.
- **S3** `src/party/coverage.js`. The Hunter is on the guide's map only where a live camera watches. Measured honest error: **0 cams 49.9% · 1 cam 33.3% · 2 cams 16.9% · 3 cams 0%**, against `(1-c)/2` to within 0.3 points. Two cameras — the middle of a game — lands **inside T3's 15–25% band**. The show starts with one camera live, because at zero coverage the guide is a coin and can never be caught lying.

**Phase 2 — the spine.** Event envelope with `vis`. Camera roster and unlock progression. PartyKit room with 9 connections.

**Phase 3 — the loop.** `CASTING 45s → EXPEDITION 90s → RECAP 10s → DEBRIEF 75s → RECKONING 45s → VOTE 25s → EXECUTION 20s → VERDICT 15s` = 5:25 an episode; 26–37 minutes a session. Extends `run.js`'s `PHASE` — **zero edits needed**, the bomb is structurally unreachable because `WINDDOWN` is entered only from `escape()` (`run.js:312-317`) and party mode exits via `finish()` (`run.js:342`).

**Phase 4 — task 1 only** (The Dark Run), then the Director, then the remaining four tasks, then roles, then the Reunion.

---

## 6. Standing invariants

- **No connection holds both the full world and the full cast until REUNION.** The PartyKit DO owns the session and never holds world state; the TV owns the world under a revocable sim lease. Forced, not chosen — `hunter-ai.js`, `damagefield.js` and `spaces.js` all import THREE, so the sim cannot move into a Worker.
- **The Director never has alignment in scope.** Enforced by import-graph check plus χ² over 1000 sim games. If cutaway frequency correlates with alignment the edit becomes an oracle and P1 dies.
- **No task names a culprit.** No timings, no accuracy readouts, no per-player failure stats until the Reunion.
- **No ability requires being on the Expedition** — the Chair Rule. At 8 players over 4 episodes, ~32% never go.

---

## 7. Decisions — all resolved

1. ~~Runner view: phone or TV?~~ **DECIDED — TV. The phone is a controller (D13).** It overrides `party-loop.md`'s "Phone first-person + touch". New work it creates: the guide is now the *only* player with private information, so casting becomes a referendum on one seat; and an evil **runner** needs a lever, which is the **throttle detent** — choosing RUN near the Hunter is loud, on camera, and completely deniable as panic. P3 survives D13 through the throttle, not the hammer. Overturned only if a stripped runner scene boots in under 8s on the worst phone in the matrix.
2. ~~Six players.~~ **DECIDED — 2 evil, settled (D14).** 33% is above the genre band and accepted; R9 drops from a balance risk to a tuning note.
3. ~~The draw-call budget is already breached.~~ **ACCEPTED as a running concern, not a blocker.** The flyover measures 644 against 625 (`game.js:2708`, `:826`). Optimisations and cuts come out of playtest. Worth keeping the number visible on the board rather than treating it as solved.
4. ~~Second-screen threshold needs re-deriving.~~ **DECIDED as D15 — dead air first, eyes second.** Primary: fraction of Expedition 5s bins with zero spectator reaction-bar taps; target <40%, alarm >60%; automatic, free, no observer. Secondary: a glance count at t=20/50/80s, warning at ⅓ of spectators and failure at ½, sustained across 2 of 3 samples, 7–8 players only, from episode 3 onward — **counting only eyes on a phone for ≥3s, because turning to argue with a neighbour is the design working, not a defection.**

## 8. The gap no gate can close

**Watchability.** C2 made six of eight players spectators, so the Broadcast Director carries the mode — and no automated gate can judge whether a round is *worth watching*. `director-cut` only proves key events weren't off-screen.

D15 narrows the gap without closing it: **dead air** is automatic and catches a dull round cheaply, but it cannot tell a rapt silent room from a bored one. The glance count can, and it needs a human in the room. Everything else in this brief can be proven by a machine; this one cannot, and pretending otherwise is how a party game ships un-fun.
