# Prototype audit — the plan against what is actually built

Audited 2026-08-19 against `web-prototype/` at `9fca696`.
Companion to [`rrr-social-deception-mode.md`](./rrr-social-deception-mode.md) (design plan v0.3).

---

## 0. Headline

Three things, in order of how much they change the plan.

**1. The prototype is far more mature than the plan assumed.** 112 source files, **91,031 lines**, 164 harness gates, a documented measurement culture where every claim carries a number and the instrument that proves it. The destruction, the Hunter and the procedural mansion are not prototypes — they are tuned, gated systems with named defects and owners.

**2. There is already a locked party-loop spec that I was not working from.** `docs/design/party-loop.md`, **"locked 2026-08-16"**, opens with *"John's direction for the Jackbox pivot. This file is the spec."* It describes the same pivot the design bible describes, and it differs in four material places. Work against it has already started — `src/game/doorway-pick.js` was measured and gated on 2026-08-16.

**3. They are complementary, not competing.** `party-loop.md` specifies **the Expedition** — pair selection, runner/guide, the task, the hunter, what happens when someone is taken. It contains **no vote, no nomination, no elimination, no endgame and no role list**; its own win condition is flagged as an assumption (*"Assumed win (change if John says so)"*). The design bible specifies exactly the parts it leaves open. The overlap is one section, and that section is where the conflicts live.

The practical consequence: **the bible's §5 should largely give way to `party-loop.md`, and everything else in the bible stands.**

---

## 1. What is built

| System | Where | State | Evidence |
|---|---|---|---|
| **Destructible walls** | `src/destruction/damagefield.js`, `wall.js`, `src/game/dig.js` | **Done and tuned.** Free-form positional destruction — a CPU damage grid is the single source of truth for the shader *and* every gameplay query, so what you see and what you can walk through cannot disagree | `dig-free` 15/15 · `dig-band` 14/1 · `dig-cover` 6/0 · softlocks 16/1750 → 0 |
| **Collapse / structural support** | `src/destruction/support.js`, `debris.js` | **Done.** Unsupported wall sags, sheds a bite, hangs until a committed pull. Chunks fall at 97% of free fall. A collapse that lands on you **takes a limb** | `debris-collapse` 17/0 · `_collapse2-arms` 11/0 · `limb-collapse` 11/0 · `_sag1-grain` 14/0 |
| **Destructible furniture** | `src/destruction/furn-voxels.js`, `src/game/furn-smash-lab.js`, `views/furn-smash.js` | **Parallel track, live.** Voxel carve. r39 in progress, last colour critic PASS at r37 | `_furn-smash-critic.mjs`, `furn-sledge` |
| **The Hunter** | `src/game/hunter-ai.js` (1534 ln), `characters/hunter.js` | **Done, and better than the plan specced.** 10 states, `awareness` 0..1, grows by absorbing limbs (3 → stage 2, 7 → stage 3), **breaches walls itself** so level topology isn't fixed | `hunter-critique.mjs`, `flee-survival`, `bang-door` |
| **Noise model** | `src/game/noise.js` (`NoiseBus`), `rules.js` (`HUNTER_SENSE`) | **Done.** Decayed loudness, 24-event cap, polled not pushed | `pc7-noise`, `_fd3_earshot` |
| **Procedural mansion** | `src/world/genplan.js` → `src/game/spaces.js`, `harness/genspike.mjs` | **Done.** Seeded plan generation, zero throws over 16 seeds, every room portable | `genspike.mjs`, `mansion`, `_plangen1-boot` |
| **Run/phase state machine** | `src/game/run.js` (429 ln) | **Done, and deliberately server-shaped.** `EXPLORE → WINDDOWN → DETONATION → RESULTS`. No three.js, no DOM — runs in node. Every mutator early-outs without `authority` | `escape.mjs` 20/20 |
| **Escape mode** | `src/views/game.js`, `docs/design/escape.md` | **Done as single-player.** Seeded live exit, three lock varieties, per-player time-to-escape score, results board | `escape` 20/20 |
| **Limb economy** | `src/game/limbs.js`, `rules.js` | **Done.** Limbs are HP *and* inventory; gadgets socket into limbs; you may fit a limb off someone else's corpse | `mechanics` 13/13 · `_limb1-rule` 9/0 |
| **Private overhead flyover** | `src/views/game.js` (`flyover.overlay`, `flyover.you`, `flyover.hunter`) | **Done.** `[F]`. Named marks, gated | `_flyover1-view.mjs`, `_flyover1-robot.mjs` |
| **Doorway picker** | `src/game/doorway-pick.js` | **Built 2026-08-16, gated, not yet wired.** Aims the sledge at the shallowest cell in a 0.80 m window; opens a walkable channel in **3 blows** | `_taskrun_picker_unit.mjs`, `_taskrun_picker_measure.mjs` |
| **Shared rules module** | `src/game/rules.js` | **Done.** Imports nothing, so node and browser load the same balance table. One copy of every number | imported by `net/server.mjs` and the client |
| **Harness** | `harness/` — 358 scripts, 164 scenario gates | **Excellent.** Playwright, determinism gates, a status board, `audit.mjs --render` boots all 37 views | `status.mjs list`, `audit.mjs` |

### The single most important thing in the codebase, for our purposes

`net/server.mjs`'s header says StageHealth **never leaves the server process** — *"Clients have no use for it and it would leak how close a wall is to opening."*

That is a hidden-information discipline, already written down, already applied. The plan's V12 (info isolation) is not a new practice to introduce — it is an existing practice to extend. That is worth a great deal.

---

## 2. What is not built

| | Status | Detail |
|---|---|---|
| **Multiplayer** | **0% wired** | `src/net/client.js` (204 ln) is well-designed and **nothing imports it** — `run.js` says so in its own header. `net/server.mjs` (17 KB) runs *"a demo field"* of a 6×3 wall grid and was never connected to `game.play`. `src/net/session-display.js` is **an empty file** |
| **PartyKit** | **Not present** | Named in `party-loop.md` and two slice docs. Zero code, zero dependency |
| **Touch input** | **Does not exist** | The entire input model is **Pointer Lock + keyboard/mouse**. `player.js` even notes iPadOS Safari *"has no Pointer Lock at all"* |
| **Lobby / QR / room codes** | Not started | — |
| **Phone client** | Not started | No phone view, no per-player UI |
| **Seated circle** | Not started | `chairRow` exists but is wall-lining showcase decor in `light-shaft.js` and `room-study.js` |
| **Roles, claims, nameplates** | Not started | — |
| **Nomination / vote / execution** | Not started | — |
| **Broadcast Director** | Not started | The TV follow-camera does not exist |
| **Chat / tips** | Not started | — |
| **Reunion** | Not started | — |

---

## 3. Plan → prototype status

| Bible § | System | Status | Note |
|---|---|---|---|
| §4 | Round loop | **New** | `run.js` is the right host — extend its phase enum rather than writing a second machine |
| §5.1 | Objective arc | **Supersede** | `party-loop.md`'s **camera unlocks** beat the bible's Exit Vault locks. See §5 below |
| §5.2 | Task deck | **Partly built** | The runner/guide pair *is* Task Contract shape 3 (sensor/actuator). The guide's flyover already exists |
| §5.2.1 | Task Contract | **New, and needed** | `party-loop.md` has no equivalent. T5 in particular is unguarded today |
| §5.4 | Watch Party / Broadcast Director | **New** | Biggest single piece of unbuilt work, and under D1 it carries five of eight players |
| §5.5 | Evil's remote levers | **New** | Matters *more* under `party-loop.md`: only 2 of 8 are in the halls |
| §6 | Hunter + attention | **Built, better than specced** | Rewrite the bible's §6.1 to match `HUNTER_SENSE`. See §5 below |
| §6.3 | Slow, rescuable kills | **Partly** | `ATTACK` takes a limb; the 3s rescue window and remote-noise save are new |
| §7 | Roles | **New** | — |
| §8 | Player-count scaling | **Conflict** | 6 players: bible says 1 evil, `party-loop.md` says 2 |
| §9 | Nomination / vote / execution | **New** | And **absent from `party-loop.md` entirely** — this is the bible's clearest contribution |
| §10 | Death / ghosts / chat | **Direct conflict** | `party-loop.md`: *"Do not write a ghost UI for taken players"* |
| §11 | Win conditions | **Partly aligned** | Both have two paths; the objective differs |
| §11.1 | Reunion | **New** | Needs the event log, which does not exist yet |
| §15 | Architecture | **Mostly built** | Authority discipline, shared rules, seeded determinism, `syncPhase`/`applySnapshot` all exist |
| §16 | Verification | **Culture already exists** | 164 gates. Add V12/V20/V21/V22 in the same style |

---

## 4. The four conflicts

`party-loop.md` is locked and John wrote it. The bible is three days newer and John locked D1–D7 in it. Where they disagree, someone has to choose — these are not reconcilable by wording.

| # | Topic | `party-loop.md` (locked 2026-08-16) | Design bible v0.3 | My recommendation |
|---|---|---|---|---|
| **C1** | **The dead** | Out for the game. Speak in real life. **"No ghost phone UI."** Explicitly listed under *Do not* | **D4** — dead become the chat, keep one vote | **Split the difference.** Keep "no ghost UI" for the *mansion* — the dead never drive a robot again. But the chat is not a ghost UI, it's the show's audience, and it is the cheapest fix for the genre's oldest problem (§1.3). Ship the dead as chat-only, no vote, and A/B the vote later |
| **C2** | **Crew size** | A **pair** — runner + guide | **Three** | **Take the pair.** It's tighter, it makes the guide's lie the whole task, and it halves the work. But it makes R2 worse — **6 of 8 spectating**, not 5 — so the Broadcast Director gets *more* important, not less |
| **C3** | **The hammer** | **Automated.** Player-aimed sledge *"dropped as the verb"* | **P3** — smashing is the dual-use verb evil abuses | **Concede, and it costs less than it looks.** The lying guide is a better deniability lever than mistimed smashing ever was. But P3 needs rewriting, and the noise-timing sabotage in §5.3 mostly dies with it |
| **C4** | **Evil at 6 players** | 2 | 1 | **Take `party-loop.md`'s 2.** 1 evil in 6 with only a pair in the halls is too thin |

---

## 5. What I would change in the plan, on the strength of the code

Four places where the prototype is simply better than what I wrote.

**5.1 — Adopt camera unlocks as the objective.** `party-loop.md`'s tasks unlock *"RRR reality-TV cameras"* that then feed everyone on the TV. That is better than the bible's Exit Vault locks on three counts: it is diegetic to the reality-TV frame instead of bolted to it; it **grows the shared information pool round over round**, so the deduction gets richer as good players succeed; and under D1 it means **the television literally gets better when good wins**, which is the most elegant possible answer to the Watch Party problem. Drop the locks.

**5.2 — Rewrite §6.1 to match `HUNTER_SENSE`, not the reverse.** The built model is sharper than mine. Sight fills awareness fast; **sound cannot fill it past `soundCeiling`**. So a noise brings the hunter into your half of the house, and only a *sighting* makes it run. That asymmetry is already exactly "evidence, never proof" — a saboteur's noise can put the hunter in the room but cannot itself kill, which means every death still needs a second cause. My §6.1 weight table should be deleted and replaced with a reference to `rules.js`.

**5.3 — The guide's flyover is the best task in the deck and it is nearly free.** `[F]` already renders a private overhead view with named `flyover.you` and `flyover.hunter` marks, gated by `_flyover1-view.mjs`. A guide who can see the hunter and talks the runner through dark corridors, out loud, in the room, is Task Contract shapes 1 and 3 at once — and a guide who says "clear" when it isn't is the purest deniable lie in the whole design. **This should be the first task built, not the Breaker Sequence.**

**5.4 — `run.js` is the phase machine; extend it.** It already has authority-gated mutators, `syncPhase`/`applySnapshot` client paths that emit through one listener set, and a seeded exit choice that is *never transmitted* because both ends derive it from one integer. The bible's §15 phase machine should be new entries in `PHASE`, not a parallel system.

---

## 6. Revised build order

The bible's M0–M7 assumed a greenfield. Given what exists:

| | Slice | Changed because |
|---|---|---|
| **M0** | **Paper prototype** | Unchanged, and now *more* valuable — C1–C4 are exactly what a paper test resolves |
| **M1** | **Networking spike — the whole game's riskiest unknown** | Was "lobby + toy". Multiplayer is 0% wired and the choice (PartyKit vs the existing `client.js`/`server.mjs` pair) is unmade. Prove 9 connections and per-socket filtering before anything else |
| **M1b** | **Touch input from scratch** | Was folded into M1. There is **no touch code in the tree** and Pointer Lock is unavailable on iOS Safari — this is a build, not an adaptation |
| **M2** | Seated circle + reaction bar | `chairRow` is decor; the circle is new |
| **M3** | Social loop, Expedition stubbed | Unchanged. Extend `run.js`'s `PHASE`. **Lay down the event log here** — the Reunion depends on it |
| **M4** | **The runner/guide task** | Was the Breaker Sequence. Guide flyover + `doorway-pick.js` are both built; wire them |
| **M4b** | Broadcast Director | Promoted — under C2 it carries six of eight players |
| **M5** | Roles | Unchanged |
| **M6** | Audience + Reunion | Unchanged |
| **M7** | Balance | Unchanged |

---

## 7. Risks the audit surfaced

| # | Risk | Severity | Note |
|---|---|---|---|
| **A1** | **The draw-call budget is a single-player budget** | **High** | Budget is **≤625 calls**, and *one gadget prop costs 39–205*. Eight customised robots in a seated circle, plus a TV camera, has never been measured. **Measure this at M2, before art is committed to the circle** |
| **A2** | **Touch input is a from-scratch build on an engine designed around Pointer Lock** | High | Not a port. `input` assumptions run through `player.js` and `views/game.js` |
| **A3** | **Two live specs disagree** | High | Until C1–C4 are decided, `party-loop.md` and the bible will send agents in different directions. Whichever wins should say so in its header |
| **A4** | **The relay/PartyKit choice is unmade and load-bearing** | High | `client.js`/`server.mjs` are well-built and unwired; PartyKit is named and absent. Choosing late costs a rewrite |
| **A5** | **No event log exists** | Medium | The Reunion (D5) is queries over a log the game does not yet keep. Cheap at M3, expensive later |
| **A6** | **Repo is 1.3 GB** (300 MB assets, 255 MB public, 239 MB refs) | Medium | Clone and CI cost. Consider LFS or splitting `refs/` out before this grows |
| **A7** | **`BOMB_SECONDS = 90` is flagged in-code as an unmeasured hypothesis** | Low | Inherited by any party mode that reuses WINDDOWN |

---

## 8. Questions

1. **C1–C4 above.** These four block coherent work; everything else can proceed without them.
2. **Which document is the spec?** My recommendation: `party-loop.md` owns the Expedition, the bible owns the round around it, and each says so at the top.
3. **PartyKit or the existing `client.js`/`server.mjs`?** The existing pair is good code with the right authority model. PartyKit buys hosting and reconnect. Real decision, not a detail.
4. **Does the party mode reuse `run.js`'s WINDDOWN/DETONATION at all**, or is the bomb timer a survival-mode-only idea?
5. **Is the aimed-dig survival slice still shipping**, or is it now purely the art/physics bed `party-loop.md` describes it as?
