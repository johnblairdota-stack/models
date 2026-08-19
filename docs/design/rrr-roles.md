# PRIME TIME — the role script for pair play

Reworks §7 of [`rrr-social-deception-mode.md`](./rrr-social-deception-mode.md) for the pair Expedition locked in [`web-prototype/docs/design/party-loop.md`](../../web-prototype/docs/design/party-loop.md) (D9) and the automated hammer (D10). Where this file and §7.3 disagree, this file is the newer one. Everything outside §7 — the round loop, the vote, the Reunion — stands.

Engine claims below are cited to the built code and were read before writing. Nothing here asks the Hunter to do something it cannot already do, except where §6 says so out loud.

---

## 1. Why Season One breaks

Season One was written for a **crew of three** and a **player-aimed sledge**. Both are gone. Two numbers do most of the damage:

**Only two players act per round, and one of them is never in danger.** The guide is on a phone flyover, not in the halls (`party-loop.md`: *"The guide cannot be taken"*). So per episode there is exactly **one** body the Hunter can reach.

**Most players never go.** With a pair drawn from 8 over a 4-episode game, a player picked at random goes out **once**, and roughly **32%** of players never go at all — `(6/8)⁴`. At 6 players it is 20%. Picks are not random either: the room re-sends whoever it trusts, which makes the tail worse, not better. **An ability gated on "if you're on the Expedition" is an ability a third of the table will never once use.**

| Season One role | Verdict | Why |
|---|---|---|
| **Contestant** | **Survives** | Nothing to break. |
| **Camera Op** — *how many Crew were close to the Hunter* | **Survives, recast** | "How many of two" is really "was the runner close", a one-bit fact the runner narrates for free in the Debrief. Recast onto something the runner **cannot know about themselves**: whether the Hunter's interest started with sight or with noise. `_sense` computes both paths and the runner sees neither (`hunter-ai.js:632-661`). |
| **Sound Guy** — *which wing the loudest noise came from* | **Dies** | The hammer is automated (D10), so noise is no longer anybody's choice: `pickDoorwayHit` aims at one wall at `WEAPON_COOLDOWN.sledge = 0.95 s` (`doorway-pick.js:33`, `rules.js:78`) and there is one runner making it. The answer is "the wing the task is in", every episode, and the TV already captions it. |
| **Editor** — *once per game, re-air 10s raw* | **Survives, strongest survivor** | Keyed to the broadcast, spent from a chair, works for a player who never leaves it. This is the shape every good role should now copy. |
| **Fan Favourite** — *make one chat tip true* | **Survives, worth more than before** | The taken are chat-only in v1 (no ghost vote), so the chat is now the whole afterlife and the tips are the seated player's only concrete puzzle. |
| **Stunt Double** — *the first time the Hunter kills you, your double dies* | **Dies as written, recast** | Fires only if you are the runner and only if you are caught: roughly a **1-in-10** chance of ever triggering at 8 players. Recast as a chair-spent shield you place on **someone else**. |
| **Glitched** | **Survives, load-bearing** | Keep verbatim. With fewer info roles it does more work, not less. |
| **Klutz** — *everything you smash is twice as loud* | **Dies** | Nobody chooses a smash any more (D10). The Outsider *function* is transplanted to the two surfaces pair play actually has: the guide's flyover, and the nameplate. |
| **Producer** | **Survives, and the engine already bounds it** | `hearNoise` is a real public API (`hunter-ai.js:301`) and it is **incapable of killing** — see §5. |
| **Fixer** | **Survives** | A rig fires on a *later* episode while its owner sits on television. P4 at full strength, and the only lever untouched by the crew shrinking. |
| **Plant** | **Survives** | Anti-oracle. Matters more now that each info role fires every single episode. |

### The rule this produces

> **THE CHAIR RULE — no good or evil role's ability may require being on the Expedition.** Every ability fires from a chair, keyed to the episode's *pair* or to the *broadcast*, both of which exist every round for every player.

**Outsiders are exempt, deliberately.** An Outsider's job is doubt, not output — it earns its slot by *possibly being in the bag*, the way BotC's Drunk does. "Maybe the guide was Static" is a defence available every episode whether or not a Static was ever dealt.

---

## 2. The script — thirteen cards

A **bag**, not a cast list: at most 8 are dealt, so the same table plays a different show twice.

### CAST — good, informed (all seated, all one line)

| Role | One line |
|---|---|
| **Contestant** | You have no special ability. You're just here to win. |
| **Camera Op** | Each episode, learn whether the Hunter noticed the runner by **sight** or by **sound**. |
| **Focus Puller** | Each episode, learn how many seconds the Hunter was visible **on the guide's flyover**. |
| **Continuity** | Once per game, as a pair is announced, learn whether **that pair contains a member of Production**. |
| **The Editor** | Once per game, force the show to re-air ten seconds **raw and uncut** from any camera, at a moment you name. |
| **Fan Favourite** | Once per game, mark one chat tip **guaranteed true**. |
| **Stunt Double** | Once per game, name the runner as they leave: the first thing the Hunter takes off them is a **limb, not the episode**. |

### CAST — good, but a liability (the Outsider slot — load-bearing, keep all three)

One per surface. That is the whole design: §2 of the bible says the game has three surfaces, and each Outsider poisons exactly one.

| Role | One line | Poisons |
|---|---|---|
| **Glitched** | You think you're another role. Your information is false. *(You are not told this.)* | The **phone** — private info |
| **The Static** | When you guide, your flyover is a second and a half behind. *(You are not told this.)* | The **halls** — the guide channel |
| **The Method Actor** | The show writes a role on your nameplate at the start of every episode. You may change it — after everyone has read it. | The **room** — the public claim surface |

Without these, the Camera Op and Focus Puller are oracles and the game solves itself in two episodes. The Static in particular is the reason a guide who walks a runner into the Hunter is never *proved* to have done it on purpose — and it is why the Focus Puller's readout is evidence rather than a verdict.

### PRODUCTION — evil

| Role | One line |
|---|---|
| **The Producer** *(demon-equivalent, always dealt)* | Once per episode, from your chair, spike the Hunter's interest in any room. |
| **The Fixer** *(minion)* | You know Production. Once per game, rig a room — the next expedition that enters it brings something down. |
| **The Plant** *(minion)* | You know Production. You register as **good** to every Cast information role. |

Each is a deniable-by-construction version of something the mansion does anyway: the Hunter wanders and investigates on its own (`hunter-ai.js`, PATROL/SEARCH), the house is structurally collapsing (`support.js`), and info is already unreliable because of the Glitched.

---

## 3. Player-count table

Evil is **1 at 4–5, 2 at 6–8** (locked). Pair size is 2 at every count.

| Players | Informed | Contestant | Outsider | Minion | Producer | Evil % | Cameras to win |
|---|---|---|---|---|---|---|---|
| 4 | 2 | 1 | 0 | 0 | 1 | 25% | 2 |
| 5 | 3 | 0 | 1 | 0 | 1 | 20% | 2 |
| 6 | 3 | 0 | 1 | 1 | 1 | 33% | **2** |
| 7 | 3 | 1 | 1 | 1 | 1 | 29% | 3 |
| 8 | 4 | 0 | **2** | 1 | 1 | 25% | 3 |

**Which cards go in the bag**

| Count | Guaranteed | Drawn |
|---|---|---|
| 4 | Producer, Camera Op | 1 of {Editor, Fan Favourite, Stunt Double} + 1 Contestant |
| 5 | Producer, Camera Op, Glitched | 2 of {Focus Puller, Editor, Fan Favourite, Stunt Double} |
| 6 | Producer, **Fixer**, Continuity, **Stunt Double**, Glitched | 1 of {Camera Op, Focus Puller, Editor, Fan Favourite} |
| 7 | Producer, Continuity | Minion: 1 of {Fixer, Plant} · Outsider: 1 of the three · 3 informed + 1 Contestant |
| 8 | Producer, **Plant**, Continuity, Camera Op, Focus Puller | Outsiders: 2 of the three · 2 more informed |

**Two deltas from the bible's §8, both deliberate:**

- **6 players wins on 2 cameras, not 3.** 33% evil with parity only **two good deaths** away is the harshest cell in the table, and the locked evil count means the pressure cannot come off there. It comes off the objective instead — and the guaranteed Stunt Double buys the first take back.
- **8 players gets a second Outsider.** R13 says rebalance the Production Panel with Outsider count, never by weakening the panel. Under pair play the panel got *stronger* (§4), so the count goes up. The Static is the second Outsider at 8 only if the group is playing a 5-episode game; below that it is drawn too rarely to fire, and the Method Actor — which fires every episode from a chair — replaces it.

The Outsider count should eventually be a **range** the Showrunner picks from, so evil can bluff "there has to be a Glitched" with nobody able to disprove it.

---

## 4. Claims, nameplates, and the Production Panel

### 4.1 The nameplate

Your **true role** is private, on your phone, forever. Your **claim** is public on the nameplate in front of your chair on the TV. Set and changed from your phone at any time. Five states:

| State | On the TV |
|---|---|
| **Undeclared** | Blank plate. Itself a statement, and the default. |
| **Drafting** | The plate glows and shows nothing. The room knows you are typing; only Production sees what. |
| **Published** | The claim, in full, on the plate. |
| **Clashed** | Two players published the same role: both plates go red and the show cuts a *counter-claim sting*. This is the game's loudest single moment and it should be authored like one. |
| **Face-down** | Taken or executed. Never flipped again until the Reunion. |

**The call sheet.** Under every nameplate, a strip of small icons: one per past episode, marking whether that player **ran**, **guided**, or **sat**. Pair play's equivalent of Avalon's mission history, and the single cheapest legibility win available — a first-timer can read the whole social state, including who has been trusted with the halls, without holding anything in their head.

The nameplate shows the claim and the call sheet. **It never shows whether a once-per-game token has been spent** — that is a thing you say out loud, or don't.

### 4.2 The Production Panel — exactly what it shows

Read-only, always on every evil phone, and **not a chat**. One row per teammate:

1. **Name and true role.**
2. **Seat this episode** — chair / runner / guide.
3. **Published claim**, live.
4. **The draft**, live, character by character, before the room sees a word of it. You watch your partner start typing "Focus Puller" and quietly pick something else.
5. **Team tokens** — which once-per-game abilities Production still holds, and whether the Producer's spike is spent this episode.
6. **The Hunter lamp** *(new for pair play)* — when a teammate is guiding, one bit: *is the Hunter on their flyover right now?* Nothing else. No map, no room name, no position.

The lamp is the one addition, and it is the answer to the question pair play created: an off-crew evil player needs to know whether their partner's "**clear!**" was a lie, so they can back it in the Debrief without having agreed anything. That is coordination performed in public, which is the whole point of D6. It is also **the first thing to cut if evil over-performs.**

**What the panel must never show:** free text, a ping, an emoji, a vote intent, a timer, a map, the runner's position, or anything a good player could not have inferred from the broadcast. The moment it carries an intention rather than a fact, it is a chat, and the best thing evil gets to do in this game is deleted.

---

## 5. Why this is balanced

**Good's pressure valve: the Continuity's one hard bit, plus a broadcast that grows.** Continuity is the only hard fact good ever receives, it is spent once, and the Plant and Glitched can both spoil it — so good has traction (R4) without an oracle. Underneath it, the objective compounds: every camera unlocked feeds **everyone** on the TV next episode, so good's information pool widens exactly when good is winning. Good's late game is supposed to feel like the fog lifting.

**Evil's pressure valve: the guide seat, which needs no ability at all.** An evil player who gets picked to guide has a full episode of deniable lying with nothing to spend and nothing to hide. The three Outsiders exist so that lie is never provable, and the Fixer's rig detonates a round late while its owner is on camera in a chair (P4).

**The structural guarantee, and it is in the code, not in this document: evil can never order a kill.** `HunterAI.hearNoise` clamps awareness to `HUNTER_SENSE.soundCeiling = 0.86` (`hunter-ai.js:310` and `:317`), and `commitAt` is `1.00` (`rules.js:322`) — sound gets the Hunter looking, only **sight** sends it running (`hunter-ai.js:34-36`, `rules.js:315`). It is also refused outright while the Hunter is already in PURSUE / ATTACK / GROW (`hunter-ai.js:302`), so a Producer cannot finish a chase and cannot pile onto one. A spike **relocates** the Hunter; the runner's own route is always the second cause. That is R1 — "evidence, never proof" — enforced by the engine rather than by tuning.

**The feed clock is public and already built.** A take is not instant: `_attack` removes **one limb per `ATTACK_CADENCE = 2.35 s`** (`hunter-ai.js:82-84`, `:1090-1115`) and `absorb` grows the Hunter at 3 and 7 parts (`rules.js:123-126`), with speed rising 2.05 → 2.70 → 3.35 (`rules.js:127`). So "evil feeding goods to the Hunter" has a gauge every player in the room can see across the whole game, and losing a leg mid-episode is a real, survivable, readable event (`gaitFor`, `limpScale = 0.44`, `rules.js:88`, `:103-108`) rather than a binary.

**The one tuning knob is the Outsider count.** Not the panel, not the Producer's spike, not the number of evil — all three are locked or engine-bounded. If evil over-performs, deal more Outsiders; more good players behaving in ways that look like sabotage is the right direction of travel for this game (R13).

**What is still soft, and should be measured first:** the Focus Puller and Camera Op each fire **every episode for the whole game**, which is a lot of true bits arriving on a fixed schedule. If good over-performs, the fix is to make them fire on the *pair* rather than on the runner (halving their resolution), not to remove them.

---

## 6. What the engine does not have yet

Explicit, in rough dependency order. Everything below is new work; nothing in `web-prototype/` is modified by this document.

| # | Needed by | What is missing | Where it lands |
|---|---|---|---|
| E1 | **Everything** | **"Taken" does not exist.** `_attack` detaches a limb and fires `onKill` per limb (`hunter-ai.js:1114`); nothing ever removes a player. There is no death in this engine — only dismemberment. A terminal `taken` event and permanent removal from the mansion are new. | `hunter-ai.js` callback + round state |
| E2 | **Stunt Double** | No GRAB window and no rescue. The bible's §6.3 `GRAB → 3s → KILL` is not built; the only interrupt is `stagger()` (`hunter-ai.js:1141`), and the runner is alone with nothing to swing. Stunt Double needs a hook on the take that converts the terminal blow into a limb loss. | `_attack` |
| E3 | **Camera Op** | **Awareness provenance is not recorded.** `_sense` branches on sight vs sound (`hunter-ai.js:632-661`) but stores only the scalar. Needs a latch: which path first carried awareness past `alertAt`. | `hunter-ai.js` + episode log |
| E4 | **Focus Puller** | No instrumentation on the flyover. `flyover.hunter` is a named live mark (`views/game.js:2460`) beside the sight cone and hearing rings (`:2464-2470`), but nothing counts frames-on-screen. | `views/game.js` |
| E5 | **The Static** | No corruption hook on the flyover. Needs a ring buffer so `flyover.hunter` can render a stale pose while `flyover.you` stays live. | `views/game.js` |
| E6 | **The Producer** | A spike must be **indistinguishable from the hammer** on the wire. `hearNoise` exists (`hunter-ai.js:301`) and `NoiseBus` carries a `kind` (`noise.js:61-72`), so a spike needs a server-only kind that is never replicated — the same discipline `net/server.mjs` already applies to StageHealth. Note `SUMMON_LOUDNESS = 0.95` (`hunter-ai.js:159`) is the threshold above which a noise pulls the Hunter across the house to a door. | `noise.js`, transport |
| E7 | **The Fixer** | Nothing schedules a collapse on a **future** round. `support.js`/`debris.js` collapse on demand; cross-episode persistence of a rigged room is new. | round state |
| E8 | **The Editor**, Reunion | No raw-footage buffer. Re-airing ten uncut seconds needs the Broadcast Director to retain pre-cut camera state. | Broadcast Director (unbuilt) |
| E9 | **Continuity**, Reunion | **No event log at all** (audit A5). Continuity, the Editor and all four Reunion beats are queries over a log that does not exist. Lay it down at M3. | new |
| E10 | **Nameplates / Panel** | No claim model, no draft channel, no per-socket role filtering. The draft feed is keystroke-level replication to a *subset* of sockets — the most privacy-sensitive thing in the build. | PartyKit (D11) |
| E11 | **Method Actor** | The show must be able to **write** a nameplate, not just read one. | claim model |
| E12 | **Call sheet** | Per-episode ran/guided/sat history, persisted and rendered under every plate. | round state + TV |

Two things worth saying plainly: **E1 is the largest hidden cost in this document** — the party mode's core noun does not exist in an engine that deliberately has no hit points — and **E9 is the cheapest thing to get wrong**, because eight of the thirteen cards above eventually read from it.
