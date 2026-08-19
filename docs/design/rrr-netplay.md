# PRIME TIME — netplay and state authority

Spec v1, 2026-08-19. Companion to [`party-loop.md`](../../web-prototype/docs/design/party-loop.md) (the locked Expedition spec), [`rrr-social-deception-mode.md`](./rrr-social-deception-mode.md) §15–16, and [`rrr-prototype-audit.md`](./rrr-prototype-audit.md) §2/§7 (A4).

Locked going in: Cloudflare PartyKit; 8 phones + 1 TV = 9 connections; QR join; hidden roles; only a pair acts per round; the guide's map never reaches the TV or another phone; the dead get chat only; no reuse of `run.js`'s WINDDOWN/DETONATION.

> ⚠️ Every PartyKit API name below is marked **[CHECK]** where I have not verified it against their docs in this session. Hook names, hibernation semantics, alarms, connection caps and pricing units must be confirmed before code is written. The *architecture* does not depend on which of those turn out to be true; the *implementation shape* does.

---

## 1. Topology — split authority, and the browser keeps the sim

**The decision: the PartyKit room owns the session; the TV browser owns the mansion; neither owns both.**

```
   PARTYKIT ROOM (one Durable Object per game)        ← SESSION AUTHORITY
     seats · tokens · phase · roles · claims · votes · chat · event log
     Worker-safe JS only. Holds NO world state, renders nothing.
      addressed │  ▲ intents        sim lease + feeds │  ▲ world events
         frames ▼  │                                  ▼  │
   ┌──────────────────────┐         ┌───────────────────────────┐
   │ 8 PHONES             │         │ TV / HOST BROWSER         │ ← WORLD AUTHORITY
   │ own role, own duty,  │         │ three.js sim: hunter,     │
   │ own view. Runner FP, │         │ DamageField, spaces,      │
   │ guide flyover.       │         │ Broadcast Director.       │
   └──────────────────────┘         │ Holds NO alignment state. │
                                    └───────────────────────────┘
```

**Why the sim cannot move into the Worker.** `src/game/hunter-ai.js:1`, `src/destruction/damagefield.js:1` and `src/game/spaces.js:1` all open with `import * as THREE from 'three'`. The Hunter's 10-state AI, the free-form damage grid and the mansion's space graph are three.js objects. Porting them is a rewrite of the three most tuned systems in the tree (audit §1). The worker-safe set is exactly `rules.js`, `run.js`, `wall.js`, `noise.js`, `support.js`, `doorway-pick.js` — all six import nothing (verified: zero `^import` lines in each). That is enough for phase, balance and stage-level wall replication, and not nearly enough for the Expedition.

**So host-authoritative-in-the-browser survives — for the world only, and demoted.** The existing prototype is its own authority (`client.js:36-39`: `game.play` still runs offline with `new WallField({ authority: true })`). Under this spec the TV keeps that authority over positions, damage and the Hunter, but it becomes a *privileged client* of the room: it holds a **sim lease** the room grants and can revoke, and it never learns a single player's alignment.

**This overrules bible §15's "authority lives on the host PC".** Three reasons it has to:

1. **A hidden-role game should not put the role table on the one screen everybody is pointing a camera at.** The TV is a public display in a room full of players; a stray debug overlay, a screen recording, or a curious person walking behind it is a total-information leak. If the TV never receives roles, no TV bug can leak them.
2. **The DO outlives the browser.** Someone will reload the TV tab. Roles, votes and the event log must not die with it (§8).
3. **Per-socket filtering wants one choke point.** Roles and votes are filtered in the DO; world feeds are filtered by the TV and *routed* by the DO. Two filters, each with one job, each testable in isolation (§9).

**The invariant that falls out, and the one to hold onto:**

> **No connection ever holds both the full world and the full cast — until REUNION.**

---

## 2. Verdict on the existing net code

| File | Verdict | Reasoning |
|---|---|---|
| `web-prototype/src/net/client.js` (204 ln) | **Adapt the pattern, discard the file** | It is good code — `client.js:45` builds `WallField({authority:false})` so a client "physically cannot open a wall"; `client.js:85-96` is a clean one-message late-joiner snapshot; `client.js:98` refuses to put `stageHealth` on the wire. But its whole surface is limbs, gadgets and wall stages (`client.js:147-156`), it has no seats, tokens, roles or per-socket concept, and its transport is a raw `new WebSocket` with no reconnect (`client.js:66-79`). PartyKit supplies its own client. Keep the *doctrine* — authority:false locals, snapshot-not-replay, cosmetics droppable-by-design — and the `on()/_emit()` shape. Retype the messages. |
| `web-prototype/net/server.mjs` (392 ln) | **Discard as a server; mine it for two things** | It is a `ws` process (`server.mjs:315`) over a 6×3 demo wall grid that was never wired to the game (`server.mjs:50-52`). Its wire is **`broadcast()` and nothing else** (`server.mjs:114-120`): there is no addressed send other than `pong`, and `welcome` hands every joiner every peer's full limb state (`server.mjs:335-336`). It is architecturally a broadcast relay — the exact opposite of what a hidden-role game needs. It also has an **unauthenticated `debug` command** (`server.mjs:298-306`) that lets any socket call `resetWalls`/`setStage`/`hunterStage`; that must not survive contact with a phone. Worth keeping: (a) the default-deny weapon gate at `server.mjs:158-177`, which is the right shape for every party intent; (b) the header comment at `server.mjs:19-21` on StageHealth never leaving the process — that is the entitlement matrix's ancestor. |
| `web-prototype/src/net/session-display.js` | **Delete** | 4 bytes. Empty. |
| `web-prototype/harness/test-net.mjs`, `test-net-gaps.mjs` | **Keep and retarget** | Real spawned server, real sockets, real two-client convergence, and `test-net-gaps.mjs` already tests disconnect cleanup and a same-tick race. That harness style is exactly what §9's spike needs; point it at the PartyKit dev server. |
| `ws` dependency in `package.json` | Stays only as long as `server.mjs` does | PartyKit does not need it. |

---

## 3. Message schema

Envelope: `{ t, v?, seq?, to? }`, JSON, `t` first — same convention as `server.mjs:110-113`. `v` is a monotonic per-document version so a late frame can be dropped. `seq` is a per-seat intent counter for idempotent replay (§8). **Rule: any frame with more than one recipient is byte-identical for all of them.** Private data is never a key in a shared object.

### Phone → Room

| `t` | Payload | Notes |
|---|---|---|
| `hello` | `{token?, name, rulesHash, build}` | Token absent = new seat (LOBBY only). Mismatched `rulesHash` → `denied` |
| `nameSet` | `{name}` | LOBBY / SEATING only |
| `pick.vote` | `{runner, guide, seq}` | Phones vote the pair (party-loop step 1) |
| `nominate` | `{target, seq}` | Once per episode per seat |
| `vote` | `{nomId, yes, seq}` | Attributed and public — see §4 row 33 |
| `claim.draft` | `{text}` | Live-mirrored to evil only (D6) |
| `claim.publish` | `{}` | Promotes draft to public |
| `react` | `{kind}` | CLAP/BOO/SUS/SHOCK. Rate-limited, aggregated |
| `chat.post` | `{text}` | **Dead seats only.** Mixed with generated lines |
| `lever.spike` | `{roomId, seq}` | Evil only; once per episode; DO validates alignment |
| `input` | `{move:[x,y], look:[dx,dy], btn, tick}` | **Runner only**, 20 Hz, routed to the TV. Never echoed |
| `guide.mark` | `{x, z}` | **Guide only.** Becomes a TV-rendered mark, not a map |
| `ack` | `{doc, v}` | Lets the DO drop superseded private docs |
| `ping` | `{at}` | Mirrors `client.js:155` |

### Room → Phone (addressed to exactly one seat unless marked ▣ = public broadcast)

| `t` | Payload | Notes |
|---|---|---|
| `welcome` | `{you, seat, token, phase, endsAt, roster, self:{role, alignment, teammates?}, duty, outbox[]}` | The only place a role is ever sent |
| `denied` | `{reason: 'full'\|'in-progress'\|'rules-mismatch'\|'superseded'}` | |
| ▣ `phase` | `{phase, episode, endsAt, info}` | Same shape as `run.js:377` `syncPhase(phase, info)` |
| ▣ `roster` | `{players:[{id, name, seat, alive, present, claim}]}` | No alignment field exists in this type |
| `duty` | `{duty: 'runner'\|'guide'\|null, taskRole}` | |
| `secretBrief` | `{...}` | Task-private data (the Junction's symbol list, the Manifest's list) |
| `guideMap` | `{t, hunter:{x,z,h,state}, runner:{x,z,h}, opened:[wallId], plan}` | **Guide seat only.** 10 Hz. Relayed from the TV |
| `runnerSense` | `{cue:'los'\|'near'\|'none', bearing?, dist?}` | **Runner seat only.** Visibility-gated (§4 row 21) |
| `roleInfo` | `{episode, text}` | Camera Op / Sound Guy readings. Owner only |
| `panel` | `{teammates[], drafts[]}` | **Evil seats only** (D6) |
| ▣ `tally` | `{nomId, for[], against[], threshold}` | |
| ▣ `chat` | `{lines:[{handle, text}]}` | Authorship never attached |
| ▣ `verdict` | `{result, executed?}` | No alignment, ever (§4.6, §9.6) |
| ▣ `reunion` | `{...full ground truth}` | REUNION phase only. Gated on phase in the DO, not on the client |
| `pong` | `{at}` | |

### TV ↔ Room

| `t` | Dir | Payload | Notes |
|---|---|---|---|
| `hello` | → | `{hostKey, rulesHash}` | `hostKey` is generated on the TV and burned into the QR; a phone cannot claim the lease |
| `lease` | ← | `{granted, resumeSpec:{worldSeed, phase, episode, pair, elapsed}}` | Deterministic rebuild input. **Never contains `castSeed`** |
| `simTick` | → | `{v, world:{...public projection}}` | 10 Hz. What the Director may show |
| `feed` | → | `{to:[seatId], t:'guideMap'\|'runnerSense'\|'secretBrief', body}` | The TV's private outbound; the DO routes and never inspects |
| `worldEvent` | → | `{kind:'noise'\|'breach'\|'grab'\|'taken'\|'taskFail', wing, at}` | Appended to the event log. **Carries no player id for `taskFail`** (T5) |
| `intent` | ← | `{seat, t:'input'\|'guide.mark', body}` | Only for the two seats on duty |
| `heartbeat` | → | `{v, at}` | 1 Hz. Loss of it freezes the Expedition clock (§8) |

---

## 4. THE ENTITLEMENT MATRIX

Classes: **TV** = host display (world-trusted, cast-blind) · **Own** = the phone the data is about · **Live** = other living phones · **Dead** = dead phones (chat-only) · **Spec** = spectators. **Spectators are not supported in v1** — the room caps at 9 and the column is kept so the answer is written down before someone adds them.

`✓` may receive · `–` must never receive in that phase · `R` at REUNION only · `DO` never leaves the Durable Object.

| # | State | TV | Own | Live | Dead | Spec |
|---|---|:--:|:--:|:--:|:--:|:--:|
| 1 | Room code / join secret | ✓ | ✓ | ✓ | ✓ | – |
| 2 | Seat token | – | ✓ | – | – | – |
| 3 | Roster: name, seat, avatar | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | Alive/dead flag | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | Presence (connected/away) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | Cast composition for this count (§8 table) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | **Own alignment + role** | **–** | ✓ | – | – | – |
| 8 | **Another player's alignment or role** | **–** | – | – | – | – (R to all) |
| 9 | **Evil teammate identities** (D6) | – | ✓ evil only | – | – | – |
| 10 | **Evil draft claims** (D6) | – | ✓ evil only | – | – | – |
| 11 | Published claims | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 | Role ability result (Camera Op count, Sound Guy wing) | – | ✓ | – | – | – |
| 13 | **Glitched flag** (§7.3 — owner is not told) | – | – | – | – | R |
| 14 | **`castSeed` / role RNG state** | DO | DO | DO | DO | DO |
| 15 | `worldSeed` (mansion geometry) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 16 | Episode task identity | ✓ | ✓ | ✓ | ✓ | ✓ |
| 17 | Pair-pick votes (in flight) | ✓ tally | ✓ | ✓ tally | ✓ tally | – |
| 18 | Runner's own pose | ✓ | ✓ | – | – | – |
| 19 | **Guide flyover map** (mansion + hunter + runner) | **–** | ✓ guide | – | – | – |
| 20 | Hunter pose/state, unconditional | ✓ sim | – | – | – | – |
| 21 | Hunter pose to the **runner** | ✓ | ✓ *only when in LOS or inside `HUNTER_SENSE.hearRange`* | – | – | – |
| 22 | **Hunter `awareness` scalar** (`rules.js:259-323`) | ✓ sim | – | – | – | – |
| 23 | Noise events **with source seat** | ✓ sim | – | – | – | – |
| 24 | Noise events as `[LOUD CRASH — EAST WING]` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 25 | `stageHealth` / DamageField cell hp | ✓ sim | – | – | – | – |
| 26 | Wall stage / open channel | ✓ | ✓ | via TV | via TV | via TV |
| 27 | Task-private brief (symbols, manifest list) | – | ✓ holder | – | – | – |
| 28 | **Task failure attribution** (who miscalled) | – | – | – | – | R |
| 29 | Per-player timings / accuracy (T5) | – | – | – | – | R |
| 30 | Chat tips + stated truth count | ✓ | ✓ | ✓ | ✓ | ✓ |
| 31 | **Which tips are true** | DO | DO | DO | DO | R |
| 32 | **Chat authorship (dead human vs generated)** | DO | DO | DO | DO | R |
| 33 | Nominations and votes (attributed) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 34 | Execution result | ✓ | ✓ | ✓ | ✓ | ✓ |
| 35 | **Alignment of the executed** | – | – | – | – | R |
| 36 | Raw event log | DO | – | – | – | – |
| 37 | Public projection of the log (recap) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 38 | Reaction-bar events | ✓ aggregate | ✓ | ✓ aggregate | ✓ aggregate | ✓ |
| 39 | Who used a Producer attention spike | – | ✓ user | – | – | R |
| 40 | Director's Cut debug reveal (§16.4) | ✓ **local dev flag only** | – | – | – | – |

**Rows that are load-bearing and non-obvious:**

- **7 + 8 together are the product.** A phone that receives another player's role ends the product. The TV column being `–` on row 7 is what makes the whole design defensible: no amount of TV bugs can produce a leak, because the bytes were never sent.
- **Row 14 is where the prototype's own good habit becomes a trap.** `run.js:43-48` says the exit "is never transmitted and never negotiated — both ends derive it from one integer". That is correct for geometry and **catastrophic for roles**: publish one seed and every phone can recompute the whole cast with `seededPick` (`run.js:147`). `castSeed` is generated in the DO, stored in DO storage, never sent, never logged to a client, and is a *different* integer from `worldSeed`.
- **Row 19 is the party-loop's hardest "Do not".** The guide map is computed on the TV (it is the sim) and relayed as an addressed `feed`. The TV therefore *possesses* it and must never *render* it. Enforced by test, not by discipline: in party mode the TV scene graph must contain no object named `flyover.overlay` / `flyover.hunter` — probe by name, exactly as `_flyover1-robot.mjs` already does (`views/game.js:2451-2460`).
- **Rows 20–22.** The runner must not be able to read the hunter's position out of devtools, so the TV visibility-gates `runnerSense` against `HUNTER_SENSE.sightRange`/`hearRange`. And **nobody**, including the guide, ever gets the `awareness` scalar: a numeric "how sure is it" readout converts the design's "evidence, never proof" (audit §5.2) into a proof.
- **Row 25 is inherited, not invented.** `server.mjs:19-21` already refuses to replicate StageHealth because "it would leak how close a wall is to opening". Same rule, wider scope.
- **Rows 28/29/35 are T5 and §9.6.** No failure event and no verdict frame may contain a player id. This is a CI grep, not a review item (V20).
- **Row 40.** The debug reveal must be reachable only from a local flag on the TV build. It must **not** be requestable over the wire in any build, or a crafted phone frame is a total leak.

**Enforcement mechanism (one choke point, testable):** all outbound goes through `sendTo(seat, msg)` / `broadcastPublic(msg)`. `broadcastPublic` accepts only objects produced by `publicProjection(state)`, a pure function whose output type has no alignment/role/awareness/health/attribution fields *by construction* — the private fields do not exist on the projected type, so they cannot be forgotten. V12 asserts it at runtime anyway: capture every frame per socket and diff against this table.

---

## 5. Reconnect and late join

- **Seat token.** 128 random bits, minted in the DO on first `hello`, returned in `welcome`, stored in `localStorage` under the room code. It is a bearer credential: never rendered on the TV, never logged, never in the QR.
- **QR contents:** `https://…/j/<roomCode>?k=<joinSecret>`. `joinSecret` stops someone who read the 4-letter code off a photo from joining a game in progress; it is rotated when the phase leaves LOBBY.
- **Rejoin ⇒ full private resync, never a replay.** `hello{token}` → the DO rebinds the seat to the new connection and sends one `welcome` carrying: phase + `endsAt`, roster, own role/alignment (+ teammates if evil), current duty, whether this seat has already nominated/voted this episode, and a **per-seat private outbox** — the last N private frames addressed to that seat (`roleInfo`, `secretBrief`, `panel`). This is `client.js:85-96`'s "the snapshot IS the state, nothing is replayed" doctrine, applied per seat.
- **What a rejoiner is *not* told:** anything addressed to another seat while it was away, and any private frame older than the current episode. Missed `guideMap` frames are simply superseded by the next one at 10 Hz.
- **Superseding.** One live socket per seat. A second `hello` with the same token closes the first with `denied{reason:'superseded'}`. Deliberate: two devices on one seat is a leak vector and a support nightmare.
- **Late join** is allowed **only in LOBBY**. After CASTING, an untokened `hello` gets `denied{reason:'in-progress'}` and a "watch on the TV" screen. No mid-game seat insertion — role distribution (§8) is fixed at cast time.
- **Duplicate name** → suffixed, not rejected.

---

## 6. Extending `run.js`'s authority pattern

`run.js` is the right ancestor and the wrong enum.

**Reuse, unchanged and imported directly into the Worker** (the file imports nothing — `run.js` has zero `^import` lines, the same property `rules.js:1-7` documents):

- `hash32` / `seedRand` / `seededPick` (`run.js:120-150`) for `worldSeed`-derived choices — the task, the wing layout, chat-tip selection. **Not for `castSeed`** (§4 row 14).
- The mutator discipline: every authoritative mutator starts `if (!this.authority) return` (`run.js:266`, `:290`, `:328`, `:343`, `:355`), mirroring `wall.js:95,120,133`. Phones and the TV construct `PartyState({authority:false})`; only the DO constructs `authority:true`.
- `syncPhase()` / `applySnapshot()` (`run.js:377-413`) verbatim in shape: the client path emits through the *same* listener set as the authoritative path, so presentation code has one route and a reconnecting phone lands silently in the right phase.
- `serialize()` (`run.js:388-395`) as the model for the public phase document: small, derived, and omitting anything derivable.

**Do not extend `PHASE`/`PHASE_ORDER`** (`run.js:52-58`). They are a linear four-step pipeline and `syncPhase` validates membership against the order (`run.js:378`); the party loop is a cycle (`LOBBY → SEATING → CASTING → EXPEDITION → DEBRIEF → NOMINATION → VOTE → EXECUTION → VERDICT → CASTING | REUNION`) with a hard timeout per phase. Adding party phases to that array silently changes what "ordering" means for the survival mode. Instead: `src/party/episode.js` exports `PARTY_PHASE` + `class PartyState` built to the same contract. Two small state machines beat one machine with two meanings.

**`BOMB_SECONDS` / WINDDOWN / DETONATION are not used** (locked). `run.js:64` flags 90 as an unmeasured hypothesis; the party mode must not inherit an unmeasured number (audit A7). The Expedition's 90 s is its own constant with its own measurement.

**Ticking.** `RunState.tick(dt)` is fed engine `dt` (`run.js:265-280`) precisely so a shader compile cannot cost a player their score. In the DO there is no frame loop: phase deadlines are absolute `endsAt` timestamps plus a scheduled alarm **[CHECK: DO alarms / `storage.setAlarm` semantics under PartyKit hibernation]**. The Expedition clock is the exception — it is driven by the TV's `heartbeat` and **freezes when the heartbeat stops**, so a browser stall does not run the round down.

---

## 7. Keeping `rules.js` single-sourced

`rules.js` imports nothing on purpose (`rules.js:1-7`) — that is exactly why `server.mjs:37-40` can load it in bare node. The same property makes it loadable in a Worker. Concretely:

1. **One file, imported by both** — the PartyKit entry imports `../web-prototype/src/game/rules.js`. No copy, no re-export shim, no "shared" package that drifts.
2. **A worker-safety gate.** `harness/worker-safe.mjs`: walk the static import graph from the worker entry and fail if it reaches anything outside the six known-clean modules, and fail the build if the bundle contains the string `three`. Same posture as `lint-glsl.mjs` in the existing `build` script. This is the gate that stops someone innocently importing `spaces.js` and shipping three.js to a Durable Object.
3. **A `rulesHash` handshake.** `hash32(JSON.stringify(canonicalTables))` using `run.js:120`'s own hash. The DO sends it in `welcome`; a phone or TV on a stale build gets `denied{reason:'rules-mismatch'}` with a reload prompt. Deploys are not atomic across a Worker and eight cached phone tabs, and a silent balance mismatch in a deduction game is indistinguishable from cheating.
4. **Balance numbers stay in `rules.js` even when only one side reads them.** That is the standing rule the file already documents; party additions (evil count by player count, vote threshold, phase timeouts, error-rate targets) go in a sibling `party-rules.js` with the same zero-import constraint.

---

## 8. Failure modes

| Failure | Behaviour | Rationale |
|---|---|---|
| **TV disconnects** | DO keeps phase, roles, votes, log. Expedition clock **freezes** on heartbeat loss. TV reconnects with `hostKey`, gets `lease{resumeSpec}` and rebuilds the mansion from `worldSeed`. If the lease is not reclaimed within `SIM_GRACE` (start at 20 s), the DO forces `DEBRIEF` with outcome `VOID`, logs `tv_lost`, and the social round proceeds. | Never lose a 30-minute social game to a browser crash. Positions are not restored — a voided episode is honest; a resurrected one is a desync. |
| **TV lease contested** | Exactly one lease holder. A second `hello{hostKey}` supersedes and the old TV goes to a "this game moved" screen. | Two Directors is two truths. |
| **Phone backgrounds** (iOS Safari suspends the socket and rAF) | 5 s heartbeat; 3 missed → `present:false` on the public roster. Runner idle >8 s → auto-recalled, **never killed**. Guide away → `guideMap` keeps flowing; the next frame is a full state. Absent votes are **abstentions**, and the threshold is over *living* players, not *connected* ones. | A network event must never be a death or a silent change to vote maths. |
| **Room full** | Cap is **9 seats, not 9 sockets**, and admission checks the token first. A tokened rejoin is admitted at cap by evicting its own stale socket. Untokened at cap → `denied{reason:'full'}`. **[CHECK: PartyKit per-room connection limit and `onBeforeConnect` rejection]** | The naive "count sockets" cap locks out the very player who just dropped. |
| **Duplicate join** | Same token twice → oldest closed, `denied{superseded}`. Same QR scanned on two devices → last wins, first told why. | |
| **Network partition (phone side)** | All intents carry `seq`; the DO dedupes on `(seat, seq)` and is idempotent per intent. A retried nomination cannot double-count. | Retry must be safe or the client cannot retry. |
| **Partition (phones reach DO, TV does not)** | DO is the arbiter, and it is the side with the game. Freeze → void → carry on. | |
| **Malicious phone** | Every intent is validated against seat, phase, alignment and duty in the DO — default-deny, in the shape of `server.mjs:158-177`. `input` from a non-runner is dropped, `lever.spike` from a good seat is dropped *and logged*. No `debug` verb exists in a production build (cf. the ungated one at `server.mjs:298-306`). | |
| **Clock skew** | All deadlines are DO-stamped absolute times; clients render `endsAt - now` against an offset measured at `welcome`. | |

---

## 9. The networking spike (M1)

**Claim to prove: nine simultaneous connections stay healthy, and per-socket filtering actually filters.** Nothing else. No three.js, no art, no mansion, no roles worth the name.

**Build:** one PartyKit room. A TV page showing a QR, a roster, a phase clock, and one large indicator reading `LEDGER: CLEAN` / `LEAK`. Eight phone pages that join by QR. On `START`, the DO deals each seat a random word as `secret` (the role stand-in), picks a pair, and then streams `guideMap` (a moving 2-D point, 10 Hz) to the guide seat and `runnerSense` (a gated bearing) to the runner seat, while the runner phone sends `input` at 20 Hz.

**Gate — `harness/party-spike.mjs`**, Playwright, 1 TV context + 8 phone contexts, in the style of the existing `harness/test-net.mjs`. Each page wraps its socket and records **every inbound frame verbatim** (this is V12's transcript capture, built at M1 rather than retrofitted):

1. 9 connections up for 120 s continuous; zero unintended closes; RTT p95 < 150 ms on the lounge wifi and < 250 ms on a phone hotspot.
2. **No phone transcript contains any other seat's `secret`** — raw substring search over concatenated frames, not over parsed objects.
3. **The TV transcript contains zero `secret` and zero `guideMap` bodies.**
4. Only the guide's transcript contains `guideMap`; only the runner's contains `runnerSense`.
5. Kill phone 3's socket at t=30 s; reconnect with its token → it recovers its own `secret` and its outbox and nothing else. A fresh context with no token is denied.
6. At cap: a 10th connection is denied *and* phone 3's tokened rejoin still succeeds.
7. Background phone 5 for 45 s (`visibilitychange` + throttling), restore → correct phase, correct clock, no duplicated intents (assert `seq` dedupe by replaying phone 5's last 3 intents).
8. Kill the TV for 25 s → phase clock frozen, then `VOID`, then a rebuilt TV resumes from `resumeSpec`.

**Also measure, because it is the bill:** frames/s/room (~30 msg/s steady: 10 Hz guide + 20 Hz input) and bytes/round. **[CHECK: PartyKit pricing units, per-message size cap, whether hibernation drops in-memory room state — if it does, every authoritative field must live in `room.storage` and the spike must prove a hibernation round-trip.]**

**Exit criteria:** gates 1–8 green on real hardware (not just localhost), with 8 real phones on real wifi at least once. Until then A4 stays open and no party feature is worth building on top.
