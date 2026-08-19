# Run Robot Run — Social Deception Mode

**Working title: "PRIME TIME"**
Design plan v0.5 — thirteen decisions locked, reconciled against the prototype

> One line: *Eight robots on a reality TV show. The producers want a body count. You talk in the room, you act on your phone, and the edit is lying to you.*

### Decisions locked

| # | Decision | Consequence |
|---|---|---|
| D1 | **Crew only drive. Everyone else watches the show.** No spy cams, no cutaway tokens, no phone powers during the Expedition. | The broadcast is now a **core system, not polish** — it has to be worth watching. Non-Crew players share one identical, public view of the round, so all private information now comes from the Crew, from roles, and from the chat. See §5.4. |
| D2 | **Light role script, ~10 one-liners.** | Season One as written in §7.3. Scripts are content, not code. |
| D3 | **Good wins by killing all evil *or* by escaping.** | Two win paths, and the strategic tension between them, are in. See §11. |
| D4 | **The dead become the chat and keep one vote.** | Ghosts-as-audience is in. See §10. |
| D5 | **The game ends in a Reunion Special with a full reveal.** | Everything the game withheld gets paid back at once. Every beat is a query over the event log, so the **log schema must be designed for it at M3**, not retrofitted. See §11.1. |
| D6 | **Evil know each other from the start, and see each other's claims live** — including drafts, before the room does. | A read-only Production Panel on evil phones (§7.5). Not a chat. Also the cheapest available fix for R2b: an off-crew evil player always has a live job. |
| D7 | **Five tasks in v1, designed for many more.** | The deck in §5.2, gated by the **Task Contract** in §5.2.1 — six rules any future task must satisfy or it's a minigame, not a deduction engine. |
| D8 | **`party-loop.md` owns the Expedition. This document owns the round around it.** | Where they disagree about what happens *inside* the mansion, `party-loop.md` wins. Where it is silent — the vote, roles, the endgame, the Reunion — this document is the spec. Both files say so at the top. |
| D9 | **The Expedition is a pair: runner + guide.** *(resolves C2)* | Runner is first-person in dark corridors; guide has a private phone flyover. **Six of eight players are now spectating**, so the Broadcast Director matters more, not less. |
| D10 | **The hammer is automated.** *(resolves C3)* | `doorway-pick.js` opens a walkable channel in 3 blows. Player-aimed sledge is not the party verb. **P3 is rewritten below** — the lying guide replaces mistimed smashing as evil's main deniable lever. |
| D11 | **Networking is Cloudflare PartyKit.** | 8 phones + 1 TV per room, QR join. The existing `client.js`/`server.mjs` pair is a reference for the *authority model*, not the transport. |
| D12 | **The party mode does not reuse `run.js`'s WINDDOWN/DETONATION.** | The bomb timer stays survival-mode only. The aimed-dig survival slice still ships as its own mode and remains the art/physics bed. |
| D13 | **The runner's first-person view lives on the TV. The phone is a controller, never a viewport.** | **This overrides `party-loop.md`'s "Phone first-person + touch"** — the one place D8's deference is deliberately set aside, on John's call. See §5.7 for what it changes. |

### Superseded by the audit

Three things in this document are now wrong and are corrected in place below:

- **§5.1's Exit Vault locks are dropped.** The objective is `party-loop.md`'s **reality-TV camera unlocks** — diegetic, and they grow the shared information pool round over round, so the broadcast literally gets better when good players win.
- **§6.1's attention weight table is dropped.** The built model in `rules.js` (`HUNTER_SENSE`) is sharper: sight fills awareness fast, sound **cannot fill it past `soundCeiling`**. A saboteur's noise can put the Hunter in the room but cannot itself kill, so every death still needs a second cause — "evidence, never proof", already implemented.
- **§15's phase machine is dropped.** `src/game/run.js` already has authority-gated mutators and `syncPhase`/`applySnapshot`. Add entries to its `PHASE`; do not write a second machine.

**One flagged consequence of D1.** With no Control Room powers, an evil player who isn't picked for the Crew has very little to do for the 90 seconds of the Expedition. That is a real balance problem, not a cosmetic one, and §5.5 is the answer to it: every evil player keeps at least one *remote* lever they can pull from their seat. If that section doesn't hold up in the paper prototype, D1 is the decision to revisit first.

---

## 0. Contents

1. [What the research says](#1-what-the-research-says)
2. [Why our setup is structurally different](#2-why-our-setup-is-structurally-different)
3. [Design pillars](#3-design-pillars)
4. [The round loop](#4-the-round-loop)
5. [The Expedition](#5-the-expedition)
6. [The Hunter and the attribution problem](#6-the-hunter-and-the-attribution-problem)
7. [Roles](#7-roles)
8. [Player-count scaling](#8-player-count-scaling)
9. [Nomination, vote, execution](#9-nomination-vote-execution)
10. [Death, ghosts, and the chat](#10-death-ghosts-and-the-chat)
11. [Win conditions](#11-win-conditions)
12. [Onboarding and accessibility](#12-onboarding-and-accessibility)
13. [Risk register](#13-risk-register)
14. [Build plan (vertical slices)](#14-build-plan-vertical-slices)
15. [Technical architecture](#15-technical-architecture)
16. [Verification plan](#16-verification-plan)
17. [Open questions](#17-open-questions)

---

## 1. What the research says

I looked at how the genre actually works — the tabletop canon (Werewolf/Mafia, The Resistance: Avalon, Secret Hitler, Blood on the Clocktower), the real-time videogame branch (Among Us, Dread Hunger, Unfortunate Spacemen, Deceit, Project Winter), and the second-screen party-game branch (Jackbox). Six findings matter for us.

### 1.1 The information funnel is the game

The consensus design frame: at game start the "funnel" of possible worlds is wide; every event narrows it until it collapses on the truth. Good design tunes **how fast** it narrows. Too fast and evil is obvious; too slow and good players are guessing at random and disengage. The single most cited failure mode is a game where the traitor's misdeeds are either unmistakable or invisible — there is no middle.

The corollary that most amateur designs miss: **every event in the game should have at least two plausible explanations.** If an event has exactly one explanation, it isn't deduction, it's a reveal.

### 1.2 One third is too many, one quarter is right

Werewolf convention lands on 25–30% evil. Blood on the Clocktower's Trouble Brewing at 8 players is 5 Townsfolk + 1 Outsider + 1 Minion + 1 Demon — i.e. **2 evil of 8**. Our scaling should sit in that band (§8).

### 1.3 Player elimination is the genre's oldest wound, and BotC's answer is the best one

Werewolf kills you in round one and you watch for 40 minutes. The known fixes are: give players resources to survive (Bang!, Coup), make it one round (One Night Ultimate Werewolf), split into concurrent halves (Two Rooms and a Boom), remove elimination (Avalon, Secret Hitler), or **keep the dead in the game as ghosts** (Blood on the Clocktower — dead players talk freely all game and keep one vote for the rest of the game). BotC's is the strongest because it preserves the social layer, which is the entire product.

We need an answer to this on day one, not as a patch. Mine is in §10 and it's the piece of this design I'm most confident about.

### 1.4 The Storyteller is what makes BotC feel like theatre

BotC's Storyteller can't win or lose, but makes real decisions and "massages the play experience" — they choose which of several legal outcomes happens, hand out false information to drunk/poisoned players, and pace the drama. That deliberate, authored fuzziness is what stops information roles from being oracles.

We don't have a human Storyteller. **We have something better: a broadcast.** See §2.

### 1.5 Among Us proved the point of tasks — and it isn't the tasks

Tasks in Among Us are not fun. They exist to (a) put players in known places at known times so alibis exist, (b) give a clock, (c) create *visual tasks* — actions that can't be faked, which are the only hard proof in the game. The lesson isn't "make tasks", it's **make tasks that manufacture testimony**. If a task can be done alone and silently, it generates nothing.

### 1.6 Real-time sabotage lives or dies on delayed effects

Dread Hunger is the sharpest example: its best traitor plays are poisoning food and dumping coal — actions whose consequences surface **later, elsewhere, to someone else**. Temporal and spatial separation between cause and effect is what destroys attribution. Unfortunate Spacemen adds proximity chat so eavesdropping and isolation are player-driven. Both games' traitors are told the same thing: be patient, the obvious kill loses you the game.

### 1.7 Jackbox's constraint list

Phones can't do a joystick or twelve buttons — but they can show **each player something only they can see**, which is exactly what a hidden-role game needs. No app install, room code on the TV, and content is the product. Also: winning is secondary, making the room laugh is the actual objective.

**Sources**
- [Social Deduction Game Design Fundamentals — BKGameDesign](https://bkgamedesign.medium.com/social-deduction-game-design-fundamentals-a4cbae378005)
- [Designing Games with Hidden Roles — MINIFINITI](https://minifiniti.com/blogs/game-talk/designing-games-hidden-roles) · [Role Assignment in Social Deduction Games](https://minifiniti.com/blogs/game-talk/role-assignment-in-social-deduction-games/)
- [On Games, Part 2: Social Deduction Games — The Ugly Monster](https://medium.com/theuglymonster/on-games-part-2-social-deduction-games-cf4212740a92)
- [Blood on the Clocktower — Wikipedia](https://en.wikipedia.org/wiki/Blood_on_the_Clocktower) · [Storyteller Advice — BotC Wiki](https://wiki.bloodontheclocktower.com/Storyteller_Advice) · [Josh Humphriss review](https://joshhumphriss.com/articles/botcreview) · [Player Elimination review](https://playerelimination.com/2023/01/12/the-not-so-secret-society-a-blood-on-the-clocktower-review/)
- [Visual tasks — Among Us Wiki](https://among-us.fandom.com/wiki/Visual_tasks) · [The UX of Among Us — UX Collective](https://uxdesign.cc/from-tasks-to-tricks-the-ux-of-among-us-d469b45dba22)
- [Dread Hunger — Wikipedia](https://en.wikipedia.org/wiki/Dread_Hunger)
- [Unfortunate Spacemen — Steam](https://store.steampowered.com/app/408900/Unfortunate_Spacemen/) · [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/UnfortunateSpacemen)
- [These Design Principles Made Jackbox a Party Game Phenomenon — Built In Chicago](https://www.builtinchicago.org/articles/jackbox-games-design-party-pack)
- [Suggested Werewolf Setups by Player Count — werewolv.es](https://werewolv.es/setups)

---

## 2. Why our setup is structurally different

Every digital social deception game to date puts the whole game on each player's own screen. Among Us players share a world but never a viewpoint. That has a cost: **all information is telemetry**. You saw it or you didn't, and arguing about it is arguing about who is lying about a fact the game already computed.

We have three surfaces, not one:

| Surface | Holds | Property |
|---|---|---|
| **The TV** | The broadcast | Public, shared, **authored, and deniable** |
| **The phones** | Private role info, private actions | Secret, per-player, asymmetric |
| **The room** | Human speech, faces, tone | Unmediated, un-loggable, the actual game |

The thing nobody else has: **the TV is not a window, it's an edit.** A reality TV show is by definition a partial, sequenced, manipulated account of what happened. That gives us, diegetically and for free, the exact authored fuzziness that BotC needs a human Storyteller to provide.

**The Showrunner (our AI director) is the Storyteller.** It decides what airs, what gets cut away from, what gets "censored for legal reasons", which camera was on, and what the chat says. Nobody has to explain why the game is withholding information — of course it is, it's television.

Three concrete consequences:

1. **We can show a fact to some players and not others, in public, without anyone feeling cheated.** ("We cut to the confessional right as the alarm went off.")
2. **We can lie on the big screen.** A glitched feed, a mis-attributed caption, a replay that's been trimmed. Players learn to distrust the screen itself — a texture no other game in the genre has.
3. **Downtime becomes content.** Players not in the mission aren't waiting, they're watching TV together in a room, which is the thing they came over to do anyway.

The design below is deliberately a fusion of three proven skeletons rather than a novel one:
**Avalon's team-proposal + hidden mission outcome** (the deduction engine) × **Among Us's live sabotage** (the set piece) × **BotC's roles, silent deaths and ghosts** (the texture), wrapped in **Jackbox's delivery model**.

---

## 3. Design pillars

**P1 — The broadcast is the Storyteller.** All authored ambiguity is justified as editing. The Showrunner never lies about *outcomes* (a lock opened or it didn't), only about *causes and attribution*.

**P2 — Testimony over telemetry.** The game shows what happened; players must explain *why*. After an Expedition, crew phones go dark: no logs, no replay, no notes. What you remember and can convince the room of is the only record.

**P3 — Every channel is dual-use.** *(rewritten under D10.)* There is no evil button. The automated hammer removes mistimed smashing as a lever, so the load moves onto **the guide's voice**: the guide sees the flyover and the runner does not, and "clear" is the same word whether it's true, mistaken, or a murder. The lie and the honest mistake remain the same observable event — the channel changed, the principle didn't.

**P4 — Cause and effect are separated.** The strongest sabotages are set up now and land 40 seconds later somewhere else. (Dread Hunger's lesson.)

**P5 — The world is noisy on its own.** The Hunter investigates empty rooms. Good players' honest mistakes look identical to sabotage. If every incident traced to a player, we'd have no game.

**P6 — Nothing is ever confirmed.** Deaths never reveal alignment. The only feedback is the Verdict (§11) and lock progress. The funnel narrows, but never collapses until the game ends.

**P7 — Death is a promotion, not an exit.** Dead players become the audience — and the audience has power (§10).

**P8 — One line per role.** If a role can't be read aloud in one breath, it isn't in v1.

**P9 — Public claims are physical.** Every robot has a nameplate on the table in front of their chair, on TV, showing whatever role they're currently claiming. Set from your phone, changeable at any time. Newcomers can see the whole social state at a glance without holding it in their head. (Paper hats optional and encouraged.)

**P10 — Atmosphere never breaks.** No menus, no "Round 3 of 5". It's ad breaks, sponsor stings, confessional cams, lower thirds, and chat.

---

## 4. The round loop

No day/night. The show is always live; good and evil can act from their phones at any time. Structure comes from **the shooting schedule**, not from a clock the game turns off.

An episode (= one round) is roughly 7–9 minutes:

### 4.1 CASTING — 45s
**The task for this episode is announced first**, before anyone is picked (D7). The **Episode Lead** (rotates each round) then picks the **Crew** — 3 players — to go into the mansion. TV shows the picks as a casting montage with headshots. Any player may spend their one-per-game **VETO** to force a re-pick.

Announcing the task first is what gives Casting its teeth: the Manifest needs people who can remember a list, the Fuse Run needs people who can count together, the Escort needs someone you trust not to drop the trophy. The Lead has to justify a pick against a *specific* job, and evil has to angle for the tasks that suit them without being seen to.

*Why:* team composition is the highest-value information in Avalon and it costs nothing to compute. Who you send, and who you refuse to send, is a public statement about who you trust.

Under D1 this phase carries even more weight: the Crew are the only players who will have private knowledge of the round, so being picked is the difference between having something to say and having nothing. Expect evil to *want* to be picked, and expect that to be readable.

### 4.2 THE EXPEDITION — 90s
The three Crew members control their robots. **Everyone else watches the show** (§5.4). The Hunter is live. Objective: open one lock on the Exit Vault. See §5.

Shortened from 120s because of D1: with five players spectating, dead time is the enemy. 90 seconds is enough for one Breaker Sequence with a real chance of failure, and short enough that nobody reaches for their phone.

### 4.3 THE DEBRIEF — 150s
Crew return to their chairs. The show airs a **Recap Reel**: 20–30 seconds of deliberately partial footage, plus the hard outcome (lock opened / not, who died). Then people **talk in the room**. Phones are dark for the Crew. This is the game.

### 4.4 CHAT — runs continuously, spikes here
The stream chat delivers **tips**: 5 statements, of which the game states exactly how many are true (e.g. "3 of these 5 are true"). Everyone sees them. See §10.3.

### 4.5 THE VOTE — up to 120s
Nominate → vote → counter-nominations under a timer → execution by sledgehammer. See §9.

### 4.6 THE VERDICT — 30s
The Showrunner announces exactly one of: **RENEWED** (play on) / **CANCELLED** (evil wins) / **SEASON FINALE** (good wins). No alignment reveal for anyone who died.

---

## 5. The Expedition

### 5.1 The objective arc

The mansion's **Exit Vault** is sealed by **N locks** (N = 3 for a 4-round game). Each successful Expedition opens one. Good wins by opening all locks *and* surviving the finale, or by executing all evil (§11).

Each Expedition, the Security Panel and the Junction spawn in **different wings**, connected by destructible walls and furniture — so the destruction tech is load-bearing: it's how you make a shortcut, and it's how you make noise.

### 5.2 The task deck (D7)

Five tasks in v1, one per episode, no repeats within a game. The Showrunner announces which one before Casting.

The deck is designed to grow. What keeps it from degenerating into a bag of minigames is that every task must pass the same contract.

#### 5.2.1 THE TASK CONTRACT

A task that fails any of these six is a minigame, not a deduction engine. This list is the thing to hold onto as the deck grows past five.

| | Rule | Why |
|---|---|---|
| **T1** | **Split the crew.** At least two Crew must be in different rooms holding different information. | A task one player can do alone generates nothing. (§1.5) |
| **T2** | **Put the only channel in the room.** The link between them is a human voice, out loud, in front of everyone. No in-game comms, ever. | This is the party game. Everything else is scaffolding. |
| **T3** | **Build in an honest error rate.** There must be a way to fail sincerely, at a measurable rate — target 15–25%. **The lie and the honest mistake must be the same observable event.** | This is the whole trick. Without it, every failure is a confession. |
| **T4** | **Fail loudly.** Failure emits noise, which feeds the Hunter. Success should require *some* noise too, so silence isn't a winning strategy. | Ties the task to the threat |
| **T5** | **Never name the culprit.** Report that something went wrong; never who, never by how much. No exact timings, no accuracy readouts, no per-player stats — until the Reunion. | The single easiest way to accidentally destroy the game |
| **T6** | **Be watchable.** Under D1, five people are only spectating. If it can't be followed on a TV from across a lounge in 90 seconds, it doesn't ship. | D1 makes this a hard gate, not a nice-to-have |

#### 5.2.2 The five

Each task has a different **shape**, and the shape determines where the lie lives. Future tasks should pick a shape rather than inventing one.

| # | Task | Shape | Where the lie lives |
|---|---|---|---|
| 1 | **The Breaker Sequence** | Relay | The reader miscalls a symbol |
| 2 | **The Fuse Run** | Sync | Someone is late on the count |
| 3 | **The Vault Dial** | Sensor / actuator | The listener says warmer when it's colder |
| 4 | **The Manifest** | Recall | The list-holder names the wrong object |
| 5 | **The Escort** | Transit | Everyone is smashing; nobody knows whose noise it was |

**1 — THE BREAKER SEQUENCE** *(build this one first)*

- The **Panel** (Crew member A) shows three empty slots and a keypad of eight symbols.
- The **Junction** (Crew member B), in another wing, is the only place the correct symbols are displayed — **on B's phone**, rendered as degraded, glitchy, low-contrast VHS static.
- B has to **say the symbols out loud, in the real room**, so A can enter them.
- C is free: break walls to shorten the route, or watch for the Hunter.

Three correct entries opens the lock; a wrong entry makes the panel **buzz loudly** and spikes the Hunter's attention on that room.

The degraded render is the trick. Tune its legibility until the honest error rate sits at 15–25% per symbol. That baseline noise is what buys evil its cover — the "obfuscate the traitor's misdeeds through honest mistakes" principle from §1.1, made mechanical.

**2 — THE FUSE RUN**

Three fuse boxes in three rooms must be thrown **within two seconds of each other**. Each player sees only their own box. The countdown is a human voice: someone calls *"three, two, one."*

Late by half a second and the circuit blows — a bang, and the mansion goes dark for ten seconds.

*Where the lie lives:* being 0.4s late is indistinguishable from lag, panic, or a robot mid-turn. **Critical: the game must never display the actual timings.** "Someone was late" — never "who". Violating T5 here would end the game's life instantly.

*Watchability:* three split-screen boxes with big lights. Among the most readable things on this list.

**3 — THE VAULT DIAL**

One Crew member turns a dial on the vault. The feedback — clicks, warmer, colder — is audible only to a second player at a listening point in an adjacent room, who has to talk them in: *"warmer… warmer… stop."*

Over-turn and the alarm goes.

*Where the lie lives:* the listener's channel is pure interpretation. Saying "warmer" when it's colder is invisible — and the audio genuinely is noisy and hard to read.

*Watchability:* the TV splits between a hand on a dial and a robot with its ear to a wall. Very tense, very cheap.

**4 — THE MANIFEST**

Three specific objects are hidden in furniture around the mansion. The **list of which three** exists only on one Crew member's phone; the other two are elsewhere and have to be told what to look for, out loud, and then go smash furniture to find it.

*Where the lie lives:* "I said the candlestick." "You said the clock." Memory under time pressure is genuinely unreliable, so a deliberate misdirection and a misheard word are the same event.

*Watchability:* robots destroying furniture is inherently watchable, and this task uses the destruction tech harder than any other.

**5 — THE ESCORT**

A fragile object — the Show Trophy — must be carried from one wing to another. The carrier moves slowly and **cannot smash**. The other two must clear the route ahead of them.

*Where the lie lives:* clearing a route means constant, loud, legitimate smashing by two people at once. When the Hunter arrives, **nobody can say whose noise brought it.** This is the highest-noise task in the deck and the hardest to attribute — save it for a late round when suspicion is already high.

*Watchability:* a physical object moving through a collapsing mansion, on a clock. The best set piece of the five.

#### 5.2.3 Growing the deck

The five above cover five shapes. Obvious room to expand: a **Vote** shape (the crew must agree on something under time pressure, and the tally is private), a **Trade** shape (two crew hold halves of a resource and must hand off), and a **Watch** shape (one crew member must observe and report a thing the others can't see — the purest testimony generator of all, and the most abusable).

Each new task ships with three numbers measured before it goes in the deck: **honest error rate**, **median completion time**, and **noise generated on success**. Without those, adding a task is a balance change of unknown size.

### 5.3 Secondary sabotage verbs (all dual-use, all deniable)

| Verb | Legitimate use | Sabotage use | Deniability |
|---|---|---|---|
| **Smash a wall** | Make a shortcut | Make noise while a teammate is exposed | "It was a shortcut." Timing is the only tell |
| **Call a symbol** | Complete the sequence | Call it wrong | Render is genuinely ambiguous |
| **Rig a fixture** (delayed) | — | A chandelier/TV/vase that collapses 30–60s later | You were three rooms away when it went off (**P4**) |
| **Decline to intervene** | You were busy | Let a teammate get grabbed | "I was mid-entry, I couldn't get there" |
| **Spend a Producer Favour** | Good spend theirs on shields/cams | Spike the chat, which spikes the Hunter | Favours are spent anonymously |
| **Hold a door / block a route** | Crowd control | Trap a teammate in the Hunter's path | Robots are clumsy |

**Rule: the game never displays "X sabotaged Y."** Not in the recap, not in the post-game — see [Q11](#17-open-questions).

### 5.4 The Watch Party — what the other five players do (D1)

They watch television and shout at it. That is the whole design, and it puts the entire burden on the broadcast being genuinely good to watch — the way a heist is good to watch even when you're not in it.

**What they keep:** the reaction bar (CLAP / BOO / SUS / SHOCK). This is heckling, not a game power — it drives crowd audio and the seated robots' body language, it costs nothing, it has no strategic effect, and it is most of what makes watching together fun. Keep it.

**What they don't get:** no spy cam, no camera control, no private feed. **Every non-Crew player sees exactly the same thing**, and they see it at the same time as everyone else in the room.

This is a real simplification with a real upside. It means:

- **All non-Crew players are epistemically identical.** Nobody off the Crew can fabricate a private observation, so every argument about the round traces back to three people. The funnel is narrower and much easier for a first-timer to hold in their head.
- **The Crew's testimony is the only testimony.** Exactly the brief: good players are limited to verbally recounting what happened.
- **The broadcast becomes the deduction surface.** What the camera chose to show, and what it cut away from, is now the shared evidence everyone reasons over — which pushes more weight onto P1 than any other decision in this document.

Therefore the **Broadcast Director** is promoted from polish to a core system:

| Requirement | Why |
|---|---|
| Multi-camera with real cut logic | It has to pick a subject, hold it, and cut on action. A locked wide shot is unwatchable. |
| Split-screen when two Crew act at once | Otherwise half of every Breaker Sequence is off-screen, and the round becomes unarguable |
| Deliberate cutaways | Confessional stings, chat reaction shots, the Hunter's entrance. **These are the authored blind spots** — the moments players will argue about |
| Lower thirds and captions | `[LOUD CRASH — EAST WING]`, `[PANEL ALARM]`, names, timers. This is how a spectator follows a round they aren't playing |
| Commentary / sponsor stings | Fills the seams, keeps P10 intact |

**The risk to watch (R2).** Five people watching a 90-second clip is fine. Five people watching a *boring* 90-second clip, five rounds in a row, is the failure mode that kills the mode. The M0 paper prototype can't test this — you'll need M4 in front of real people, and the metric is in §16.5.

### 5.5 Evil's remote levers — the D1 counterweight

Because an evil player may not be on the Crew, every evil player needs something they can do from a chair. This is the balance patch for D1 and it should be treated as load-bearing:

| Lever | Who | Deniability |
|---|---|---|
| **Attention spike** — pick a room, spike the Hunter's interest, once per episode | The Producer | The Hunter wanders anyway (§6.1). Anonymous |
| **Chat spike** — spend a Favour to flood the chat, which raises the Hunter's alertness | Anyone, evil or good | Favours are spent anonymously, and good players spend them too |
| **Carry-over rigging** — a fixture rigged on a *previous* Expedition collapses on this one | The Fixer | You were in a chair on television when it went off (**P4** at its strongest) |
| **Testimony** — the Debrief is 150s and the vote is the whole game | Anyone | This is still the main event. Off-crew evil is not powerless; it's just not holding a sledgehammer |

If playtesting shows off-crew evil is still dead weight, the next lever to add is a once-per-game **"Producer's note"**: force the Broadcast Director to cut away from a chosen robot for 10 seconds. Deniable (the camera cuts away constantly), remote, and thematically perfect. It's deliberately *not* in v1 because it's the kind of power that's hard to un-ship.

### 5.6 Expedition outcomes

Three semi-independent results, all announced publicly:

- **LOCK:** opened / not opened
- **CASUALTY:** who died (never *why*, never their alignment)
- **INCIDENT COUNT:** "3 alarms this episode" — a number, with no attribution

That last one is the deduction fuel. Everyone knows *how many* things went wrong. Nobody knows which were malice.

---

### 5.7 What D13 changes

Putting the runner's view on the TV is cheap technically and expensive conceptually. Both halves are worth stating.

**What it buys.** No shader compile on a cold phone (`player.js` documents 30–60s on *desktop*, against a 90s Expedition). No second renderer on the worst hardware in the room. The ≤625 draw-call budget stays a desktop budget. Motion sickness — a bobbing corridor 30cm from the face — disappears as a category. And the phone client stops being a 3D client: the runner's phone is a thumbstick, the guide's phone is a 2D map. That is a large scope reduction on the piece the audit called a from-scratch build.

**It also makes the room a room.** Eight people watching one person stare into their own phone is the failure this pivot exists to avoid. Under D13 *everyone including the runner* is looking at the same screen.

**What it costs — and this is the real consequence.** The runner has no private view. Everyone sees what the runner sees, and the guide's calls are spoken out loud, so everyone hears those too. **The only unwitnessed thing left in the entire game is the guide's map.** The deduction reduces to one question: *was the guide's call consistent with what their map could have shown?*

That is unusually legible for a first-time player, which is a real accessibility win. But it is narrow, and it puts the whole game on one player per round.

**Two consequences that need designing, not noting:**

1. **The guide is now the seat evil wants**, and everyone knows it. Casting becomes a referendum on one pick. Expect that to be readable, and expect good players to start refusing to hand the guide's chair to anyone twice.
2. **An evil *runner* has almost nothing to do** — every action they take is on television. This is a real hole, and the fix is already in the control scheme: the **throttle detent** (STILL / CREEP / WALK / RUN, with the noise ring drawn around the stick) is the runner's dual-use verb. Choosing RUN while the Hunter is close is loud, visible, and *completely deniable as panic*. P3 survives D13 through the throttle, not the hammer.

**What makes the guide's lie survivable at all is S3's camera gating.** If the guide's map showed everything, the room could reason backwards from the map to the lie perfectly. Because coverage is partial and **nobody but the guide knows how much they could see**, the honest mistake and the lie stay indistinguishable. D13 makes the camera-coverage gate load-bearing twice over.

**What would overturn D13:** at M1b, measure cold boot-to-playable of a stripped runner scene on the worst phone in the test matrix. Under **8 seconds**, phone-rendered first person returns as a v2 A/B. Above it, D13 is permanent.

## 6. The Hunter and the attribution problem

This is the hardest part of the brief and it deserves its own section.

**The problem:** if the Hunter only ever comes when an evil player summons it, the Hunter *is* a floodlight pointed at the traitor. If it comes at random, it's noise and nobody can deduce anything. We need a middle where a Hunter incident is *evidence* but never *proof*.

### 6.1 The Attention model

The Hunter has an **attention score** per room, decaying over time. It moves toward the highest score. Sources:

| Source | Weight | Who controls it |
|---|---|---|
| Wall smashing | High | Any Crew member, constantly, legitimately |
| Panel buzz (wrong symbol) | High | Whoever is calling out |
| Rigged fixture collapse | High | Evil, 30–60s earlier |
| Chat spike | Medium | Anyone spending a Favour, anonymously |
| Robot sprinting | Low | Everyone does it |
| **Idle curiosity** | Low, **random** | Nobody |

That last row is mandatory and non-negotiable. The Hunter **wanders and investigates empty rooms on its own schedule**. Baseline false positives are what make an incident ambiguous. Target: **roughly 40–50% of Hunter arrivals should have no evil cause at all.**

### 6.2 Make noise physical and public

On the TV, every noise emits a visible expanding ring from its source, with a lower-third caption ("*[LOUD CRASH — EAST WING]*"). The whole room sees that a noise happened, and roughly where. Nobody sees *who*. This is the single best legibility win available: the effect is public, the cause is private.

### 6.3 Kills are slow, and rescuable

`CALM → ALERT → HUNTING → CHASE → GRAB → (3s) → KILL`

During the GRAB window, **any other player anywhere in the mansion can smash something to pull the Hunter off.** That means:

- Good players can heroically save each other — a genuinely thrilling, TV-worthy moment
- Evil can *fail to* save someone, or "try" too late, or be conveniently mid-sequence
- Saving someone costs you: you just made a loud noise in *your* room

That last point is the good design. Every rescue is a sacrifice with a visible price, and every non-rescue has an excuse.

### 6.4 The Hunter as the star

Framing-wise the Hunter isn't a monster, it's the show's celebrity antagonist — it gets a lower-third name card, an entrance sting, and the chat loses its mind when it appears. Keeps P10 intact and makes the scariest part of the game funny.

---

## 7. Roles

### 7.1 Scope recommendation

**Yes to roles, but one tight script for v1.** Blood on the Clocktower's depth comes from 100+ roles and a human Storyteller adjudicating their interactions — that is years of work and the wrong first target. Ship one script of ~10 roles, all one-liners, all readable off a nameplate. Design the data model so scripts are content, not code, and the door to more stays open.

### 7.2 The constraint: no night phase

Every role must work without night orders. That leaves exactly three shapes:

- **Passive/continuous** — you get a ping when a condition fires
- **Once-per-game** — spend it whenever you like, from your phone
- **Expedition-conditional** — only works if you're on the Crew

That constraint is a gift: it forces roles to be simple, and it means role abilities are decisions made *under social pressure in real time*, which is more dramatic than a night action.

### 7.3 Starter script — "SEASON ONE"

**CAST (good, informed)**

| Role | One line |
|---|---|
| **Contestant** | You have no special ability. You're just here to win. |
| **Camera Op** | Each episode, learn how many Crew were close to the Hunter. |
| **Sound Guy** | Each episode, learn which *wing* the loudest noise came from. |
| **Editor** | Once per game, force the broadcast to replay 10 seconds of **raw, unedited** footage of a moment you choose. |
| **Fan Favourite** | Once per game, make one chat tip **guaranteed true**. |
| **Stunt Double** | The first time the Hunter kills you, your double dies instead. |

**CAST (good, but a liability — the Outsider slot)**

| Role | One line |
|---|---|
| **Glitched** | You think you're another role. Your information is false. *(You are not told this.)* |
| **Klutz** | Everything you smash is twice as loud. |

The Outsider slot is essential, not flavour: it's the reason no information role can be trusted at face value, and it's the reason "you looked suspicious" isn't proof. Without it, info roles are oracles and the game solves itself.

**PRODUCTION (evil)**

| Role | One line |
|---|---|
| **The Producer** *(demon-equivalent)* | Once per episode, spike the Hunter's attention on any room, from your phone. |
| **The Fixer** *(minion)* | You know who The Producer is. You can rig a fixture to collapse later. |
| **The Plant** *(minion, 7–8p)* | You know the other Production members. You register as good to every Cast information role. |

Note how each evil ability is a **deniable-by-construction** version of something the world does anyway (§6.1): attention spikes happen naturally, fixtures collapse in a decaying mansion, and info roles are already unreliable because of the Glitched.

### 7.5 The Production Panel (D6)

Evil know each other from the moment the show starts. On every evil phone, always visible:

- Each teammate's **name and true role**
- Each teammate's **current claim — including drafts they haven't published yet.** You watch your partner start typing "Sound Guy" before the room sees it, and quietly pick something else.
- Which once-per-game abilities the team still holds

**It is read-only. It is not a chat.** That line is deliberate and worth defending: all actual coordination happens out loud, in front of everyone, in the room. Watching your partner's claim form in real time and silently steering around it *is* the coordination — and doing that while making conversation with the people you're deceiving is the best thing evil gets to do in this game. A private text channel would delete that entirely, and I'd resist it even if asked. *(Open question 21.)*

Two consequences worth naming:

- **It's the cheapest fix in this document for R2b.** An off-crew evil player now always has a live job: managing the team's claim surface while five people watch television.
- **It makes evil meaningfully stronger.** That's fine, but rebalance it with the **Outsider count**, not by weakening the panel — more Glitched and Klutz means more good-player behaviour that looks like sabotage, which is the right pressure valve.

### 7.4 Claims and nameplates

Your **true role** is private, on your phone, always. Your **claim** is public, on the nameplate in front of your chair on the TV, set and changed from your phone at any time. Default claim is blank ("*undeclared*"), which is itself a statement.

This is a major accessibility win: a first-time player can read the entire social state off the screen instead of tracking it in their head. It also makes the classic hidden-role moves — hard claim, soft claim, counter-claim, bus — legible to people who've never heard those words.

---

## 8. Player-count scaling

Following the BotC/Werewolf convention of ~25% evil (§1.2):

| Players | Cast | Outsider | Minion | Producer | Evil % | Locks to win | Crew size |
|---|---|---|---|---|---|---|---|
| 4 | 3 | 0 | 0 | 1 | 25% | 2 | 2 |
| 5 | 3 | 1 | 0 | 1 | 20% | 2 | 2 |
| 6 | 3 | 1 | 1 | 1 | 33% | 3 | 2 |
| 7 | 4 | 1 | 1 | 1 | 29% | 3 | 2 |
| 8 | 5 | 1 | 1 | 1 | 25% | 3 | 2 |

**Crew size is 2 at every count (D9), and evil is 2 from six players up (C4).** One evil in six, with only a pair in the halls, is too thin to threaten anyone.

Notes:
- 6 players at 33% evil is above the genre's 25–30% band, and that is deliberate: with only a pair acting, an evil player who is never picked contributes almost nothing, so the second traitor is buying *coverage*, not power. Watch it in playtest — this is the count most likely to need a change.
- Below 6, consider this a tutorial/warm-up configuration rather than the real game.
- Outsider count should eventually be a *range* the Showrunner picks from (BotC style) so evil can bluff "there must be a Glitched" without anyone able to disprove it.

---

## 9. Nomination, vote, execution

Adopting BotC's proven vote structure, because it's tight and it prevents the chaos spiral:

1. **Nomination.** Any living player may nominate **once per episode**, and may be nominated **once per episode**. On the TV, the nominator's robot stands up and points. Attributed, public, permanent.
2. **The pitch.** 20 seconds for the nominator, 20 for the accused. Confessional-cam framing on the TV.
3. **The vote.** All living players vote from their phone. Ghosts have one vote for the rest of the game (§10). Threshold: **more than half of living players** — below that, nothing happens.
4. **Counter-nomination window.** A visible timer; anyone who hasn't used their nomination may go. The TV keeps a running leaderboard of vote counts.
5. **Execution.** Highest vote count above threshold dies. **Tie = nobody dies.** The nominator picks up the sledgehammer and smashes the accused apart, in full cinematic glory.
6. **No reveal.** The nameplate is turned face-down. Nothing about their alignment is shown, ever.

Making the *nominator* swing the hammer is a deliberate social cost: accusing is not free, and the game visually charges you for it. It also means evil bussing a partner has to physically do it on TV, which is great content.

---

## 10. Death, ghosts, and the chat

This is my strongest recommendation in the document.

### 10.1 The dead become the audience

When you die, your robot is dragged off, and you're **promoted to a verified viewer**. On your phone you get a chat handle and an avatar. You:

- **Can post into the stream chat** — which is on the TV, which everyone reads
- Keep talking out loud in the room, because you're sitting right there
- **No ghost vote in v1** *(resolves C1)*, and **no UI in the mansion at all** — `party-loop.md`'s "no ghost phone UI" holds for the robot; the chat is the show's audience, not a ghost interface. The BotC-style single vote is a later A/B, not a v1 feature.

### 10.2 Why this is the right answer

The dead-player problem is the genre's oldest wound (§1.3). Every other solution makes the dead *harmless*. This one makes them **powerful but unattributable** — because their messages are mixed in with the Showrunner's generated chatter, and nobody knows which lines in the chat came from a dead human.

That gives us, for free:
- Dead players stay engaged and mischievous
- A dead evil player can keep working for their team from beyond the grave
- The chat is no longer decoration — it's a live channel of half-trustworthy information
- Executing someone becomes a real trade-off: you might be handing a traitor a megaphone

### 10.3 Chat tips

Each episode the chat posts **five tips** with a stated truth count: *"3 of these 5 are true."*

```
xX_boltface_Xx      : the one in the yellow hat went upstairs alone
mansionfan1994      : nobody touched the east panel
DEFINITELY_A_ROBOT  : the crash was on purpose
tvlover             : two people were together the whole time
b0ne5aw             : the lead is lying about the veto
```

The stated truth count is what turns this from noise into a puzzle — and it's the thing that gives a player with no role and no expedition something concrete to argue about, which is a huge accessibility lever (§12).

The **Fan Favourite** can lock one tip as true. The dead can inject tips. Living players can spend a Favour to buy one extra tip. Evil can spend a Favour to spike the chat and pull the Hunter.

---

## 11. Win conditions

**Good (the Cast) wins if:**
- All Production members are dead, **or**
- All N locks are open *and* the Cast survives the Finale Expedition

**Evil (Production) wins if:**
- Living evil ≥ living good (parity), **or**
- The locks are not all open by the end of the final episode

Two win paths for good is deliberate: it means good must decide each round whether to spend it hunting traitors or opening locks, and evil must decide whether to stall or to kill. That tension is the strategic spine, and it's what stops the game collapsing into pure accusation.

The **Verdict** (§4.6) is the only feedback loop *during* the game. "RENEWED" tells good that evil is still alive — real information, delivered without revealing anything about the person they just destroyed.

### 11.1 THE REUNION SPECIAL (D5)

Everything the game withheld gets paid back here, at once. This is what earns P6: silent deaths are only tolerable because of what happens at the end.

Four beats:

| | Beat | What airs |
|---|---|---|
| 1 | **Roll call** | The dead are reassembled and everyone retakes their chair. One at a time, each nameplate flips: **true role** beside **what they claimed**. Slow. Let the room shout. |
| 2 | **The Director's Cut** | The raw, unedited footage of the round that decided the game — with sabotage captioned for the first time. `[THE FIXER RIGGED THIS CHANDELIER — EPISODE 2]`. Every lie the broadcast told is now annotated. |
| 3 | **The awards** | Most Trusted (never nominated) · The Mark (most-voted good player) · Best Liar (evil, never nominated) · Loudest Robot · The Klutz Award (most honest mistakes) · Cold Blood (bussed a teammate). This is where a party game actually lands — it's the bit people quote afterwards. |
| 4 | **The chat, unmixed** | The final scroll, colour-coded: which lines were real dead players, which were generated. Nobody has been able to tell all game. |

Three notes that matter for the build:

- **Every beat is a query over the append-only event log** (§15). Cheap to build *if* the log is right, expensive if it isn't — so design the log schema against the Reunion at **M3**, not at M7. This is the strongest argument for the event-sourced architecture.
- **Ship a host control: SKIP TO REUNION.** Games get abandoned when the pizza arrives. An abandoned game with no reveal is a game where the silent deaths were pure cost.
- **If the Reunion is weak, P6 is just frustrating.** Treat it as a headline feature, not an epilogue screen.

---

## 12. Onboarding and accessibility

- **The lobby is the tutorial.** Free-roam smashing while waiting teaches move + smash with zero instruction. Non-negotiable — it's already the plan and it's correct.
- **Everything a player must know is on the TV.** Nameplates (claims), lock progress, incident count, who's alive, whose turn to nominate.
- **One-line roles** (P8), pushed to the phone as a card you can re-read at any time.
- **A player with no role and no expedition still has:** the reaction bar, chat tips with a stated truth count, a veto, a nomination, and a vote — and under D1 they see exactly what everyone else sees, so they're never behind. What they don't have is private information, which is the point: the argument is about three people's stories, and anyone can join it.
- **A "first time?" toggle** in the lobby that puts an extra hint line on your phone each phase ("*you can nominate — it's free, and it makes people talk*").
- **Colour-blind safety:** robots must be distinguishable by silhouette/accessory, not just colour. The Breaker symbols must not be colour-coded.
- **The degraded symbol render must be degraded by noise, not by contrast** — otherwise it's an accessibility trap rather than a design feature.
- **Reading load:** chat tips need a large-type mode on the TV. Five lines of small text across a lounge is a real failure mode.

---

## 13. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Attribution collapses** — the Hunter always traces to evil, or never does | Fatal | Tune baseline idle-curiosity rate; instrument "% of Hunter arrivals with no evil cause"; target 40–50% |
| R2 | **The Expedition is a spectator sport** for 5 of 8 players — the direct cost of D1 | Fatal | Make the broadcast worth watching (§5.4 Broadcast Director); cut Expedition to 90s; measure second-screen rate (§16.5) |
| R2b | **Off-crew evil has nothing to do** — the other cost of D1 | High | Remote levers (§5.5); if insufficient, add the Producer's Note |
| R3 | **Nobody talks** — the video game eats the party game | High | Phones dark during Debrief; Breaker Sequence forces speech; short mission, long debrief |
| R4 | **Good has no traction** because deaths never reveal | High | Lock progress + Verdict + incident count are the compensating signals. Playtest good win rate ≥45% |
| R5 | **Round length creep** — 5 rounds × 9 min = too long | Medium | Hard timers on every phase; target 25–40 min total |
| R6 | Phone joins fail on someone's carrier/wifi | Medium | Local network fallback, short room codes, aggressive reconnect-by-token |
| R7 | Roles are too complex for a games night | Medium | One-line rule; ship a "no roles" quick mode |
| R8 | Motion sickness / control frustration on phone | Medium | Simple stick + two buttons; test on small screens early |
| R9 | Evil feels helpless in a 6-player game with 1 traitor | Medium | Scale Expedition difficulty, not traitor count |
| R10 | The chat is unreadable across a lounge | Low | Large-type mode, cap to 5 tips, slow the scroll during debrief |
| R11 | **The Reunion is now load-bearing** (D5) — if it's weak, or the group quits early, silent deaths never pay off | High | Build it at M3 off the event log; ship SKIP TO REUNION; treat it as a headline feature |
| R12 | **Five tasks is five times the content risk** (D7) — each needs art, code, its own error-rate tuning and TV readability | High | Ship M4 with the Breaker only and prove the Task Contract; batch the other four in M4b with the three required numbers measured per task |
| R13 | **The Production Panel makes evil stronger** (D6) | Medium | Rebalance via Outsider count, not by weakening the panel |
| R14 | A task violates T5 and names a culprit — via a timing readout, an accuracy score, or a caption | Fatal | Automated check V20 asserts no payload or caption identifies a player, run in CI |

---

## 14. Build plan (vertical slices)

Each milestone should be independently playable and independently fun. **Do not build in this order if the paper prototype hasn't happened yet.**

### M0 — PAPER PROTOTYPE (no code)
Index cards, a phone timer, and one of you as a human Showrunner narrating expedition outcomes. Test the *social* loop only: casting → outcome → debrief → vote → verdict, with silent deaths. **This is the highest-value thing you can do this week** and it de-risks R1, R3, R4 and R7 before a line of game code exists.

### M1 — LOBBY + TOY
QR/room code, up to 8 phone joins, name + colour + accessory, free-roam mansion, smash walls and furniture. Verify: 8 real phones on real wifi, in the actual lounge.

### M2 — THE CIRCLE
Entrances, cinematics, 8 chairs, nameplates, hype/banter reaction bar. No game rules yet. Should already be funny.

### M3 — SOCIAL LOOP, NO MANSION
Full round structure with the Expedition **stubbed to a dice roll**. Casting, nominate, vote, sledgehammer execution, verdict, silent deaths. This is a complete, playable social deception game and the point at which you find out if the design works.

### M4 — THE EXPEDITION (one task)
**The Breaker Sequence only**, Panel + Junction spawning, the Hunter, attention model, rescues, **and the Broadcast Director** — which under D1 is not a later polish pass, it's what five of your eight players are experiencing. Build the cut logic in this slice, not after it.

Prove the Task Contract on one task before building four more.

### M4b — THE TASK DECK
Fuse Run, Vault Dial, Manifest, Escort. Each ships only once its honest error rate, median completion time and success-noise are measured (§5.2.3). Per-episode task selection with no repeats.

### M5 — ROLES
Season One script, claims/nameplates, phone role cards.

### M6 — THE AUDIENCE AND THE REUNION
Ghost promotion, chat, tips with truth counts, Favours. **The Reunion Special** — roll call, Director's Cut, awards, unmixed chat — built as queries over the event log laid down in M3.

### M7 — BALANCE
Headless simulation at scale, telemetry, tuning passes.

---

## 15. Technical architecture

Sketch, to be firmed up once §17 is answered.

```
        ┌──────────────────────────────┐
        │  TV CLIENT  (host PC, HDMI)  │   authoritative sim
        │  render + audio + Showrunner │   seeded RNG, event log
        └──────────────┬───────────────┘
                       │ WebSocket (LAN, wss on host)
        ┌──────────────┴───────────────┐
        │      ROOM  ( 4-8 phones )    │   thin clients
        │  join by QR / 4-letter code  │   no install, browser only
        └──────────────────────────────┘
```

**Key decisions to lock early:**

- **Authority lives on the host PC**, not on phones. Phones send intents, never state. Non-negotiable for a hidden-role game — a client that knows other players' roles is a client that leaks them.
- **Phones never receive information their player shouldn't have.** Filter server-side, per socket. Test this explicitly (§16, V12).
- **Seeded, deterministic simulation.** One RNG seed per match, all randomness drawn from it, every input timestamped and logged. This gives us free replay, free bug reproduction, and the headless balance sim in M7. Worth the discipline cost many times over.
- **Every state change is an event** in an append-only log. The recap reel, the Editor's raw-footage replay, and the post-game summary are all just queries over that log.
- **Reconnect by token** in localStorage. Someone's phone will lock. It will happen every session.
- **Phase machine is explicit and serialisable**: `LOBBY → SEATING → CASTING → EXPEDITION → DEBRIEF → NOMINATION → VOTE → EXECUTION → VERDICT → (CASTING | GAME_OVER)`. Every transition guarded, every phase with a hard timeout.

---

## 16. Verification plan

The user asked specifically what we need to build to *know* each part works. Answer: a layered harness, built alongside the features rather than after.

### 16.1 Test layers

| Layer | Tool | What it proves |
|---|---|---|
| **Unit** | vitest/jest | Vote maths, role assignment tables, win-condition checks, attention scoring |
| **Simulation (headless)** | Custom bot runner over the deterministic core | Balance. Thousands of games, no rendering |
| **Integration** | Fake phone clients on the real socket | Protocol, info-leak isolation, reconnects |
| **End-to-end** | Playwright — 1 TV page + 8 phone contexts | The real thing, scripted |
| **Chaos/soak** | Playwright + fault injection | Disconnects, mid-round joins, backgrounded phones |
| **Human playtest** | Your lounge, 8 people, a stopwatch | Everything that matters |

### 16.2 Per-mechanic verification

| # | Mechanic | "Working" means | Automated check | Playtest check |
|---|---|---|---|---|
| V1 | Lobby join | 8 phones join in <30s, names/skins persist | E2E: 8 contexts join, assert roster | Do it on the actual lounge wifi |
| V2 | Movement/smash | Reaches a target room, destroys walls, ~60fps | Bot pathing test; perf budget assertion | "Did anyone need instructions?" |
| V3 | Seating/intro | All 8 seated, no soft-lock if a phone drops mid-cinematic | E2E with a forced disconnect | Is it funny the second time? |
| V4 | Role assignment | Distribution matches §8 exactly for every count | Unit: 10k assignments per count, assert exact composition | — |
| V5 | Casting/veto | Lead picks 3; veto forces re-pick; one veto per player per game | Unit + E2E | Does the pick spark argument? |
| V6 | Breaker Sequence | Sequence completes with correct calls; buzzes on wrong | Integration: scripted correct/incorrect runs | **Measure honest error rate — target 15–25%/symbol** |
| V7 | Hunter attention | Moves to highest-scoring room; decays; wanders when idle | Unit on scoring; sim asserting movement distribution | Does it feel fair or arbitrary? |
| V8 | **Attribution balance** | 40–50% of Hunter arrivals have no evil cause | **Sim: 1000 games, log `hunter_arrival` with `causedByEvil` flag, assert band** | Post-round survey: "who caused that?" — accuracy should sit near 50–65%, not 95% |
| V9 | Rescue window | Any player's noise pulls the Hunter off during GRAB | Integration: scripted grab + remote smash | Does saving someone feel heroic? |
| V10 | Silent death | No client ever receives the alignment of a dead player | **Integration: assert no socket payload contains a dead player's role** | Does anyone feel cheated by it? |
| V11 | Vote maths | >50% threshold, one nom + one nom-against per player, tie = no death, ghost vote spends once | Unit: exhaustive table of vote scenarios | Is 120s enough? |
| V12 | **Info isolation** | No phone receives data its player isn't entitled to | **Integration: full transcript capture per socket, assert against an entitlement matrix.** Run in CI on every commit | — |
| V13 | Chat tips | Exactly the stated number are true; Fan Favourite lock works | Unit: generator invariant test, 10k draws | Can people read them from the couch? |
| V14 | Ghost/audience | Dead players post; messages indistinguishable from generated | Integration on the mixing function | Do the dead stay engaged? |
| V15 | Win conditions | All paths fire correctly and exactly once | Unit: state-table coverage | — |
| V16 | Reconnect | Phone locks/reloads mid-round, returns with correct private state | Chaos: kill and restore each socket in every phase | Someone will background their phone. Test it |
| V17 | Full loop | 8-player game runs start to finish, no soft-locks | E2E soak: 100 scripted games with random inputs | 3 sessions with real humans |
| V18 | **Broadcast Director** | Never loses the action: no Breaker entry, alarm, or Hunter arrival happens fully off-screen unless deliberately cut | Sim: replay 500 recorded rounds through the director, assert every `key_event` was either on-screen or flagged as an intentional cutaway | **Watch a round you're not in. Was it worth watching?** |
| V19 | Remote levers | Producer spike, Favour chat spike and carry-over rigging all fire from a seat | Integration per lever; sim asserting off-crew evil influences ≥1 event per round on average | Does off-crew evil feel involved? |
| V20 | **Task Contract conformance** | No task ever names a culprit (T5); every task splits the crew (T1) | **Per task: assert no socket payload or TV caption contains a player id in a failure event; assert ≥2 distinct rooms required. CI on every commit** | Per task: measure honest error rate against the 15–25% band |
| V21 | **Reunion accuracy** | The Reunion reconciles exactly with ground truth, and nothing it shows leaked earlier | Property test: replay 500 sim games, assert every revealed role/sabotage matches the seed's ground truth **and** that no pre-Reunion payload contained any of it | Does the roll call land? Do the awards get a laugh? |
| V22 | **Production Panel isolation** | Only evil sockets ever receive teammate roles or draft claims | Integration: assert no good socket's transcript contains another player's true role or an unpublished claim | — |
| V23 | Task selection | One task per episode, no repeats within a game, announced before Casting | Unit over 10k game seeds | Does the announcement change who gets picked? |

### 16.3 The balance simulator (build this at M3, not M7)

The single highest-leverage piece of tooling. A headless runner that plays complete games with scripted bot policies (naive-good, cautious-good, patient-evil, aggressive-evil) and reports:

- Good win rate by player count — **target 45–55%**
- Average rounds to conclusion
- % of executions that hit an evil player — **target 40–60%** (below 35% = good is guessing; above 70% = evil is transparent)
- Hunter arrivals by cause (V8)
- Breaker honest-error rate (V6)

Bots can't model the social layer, so this doesn't validate whether the *game* is fun — it validates that the mechanical scaffolding isn't already broken before you put humans in front of it.

### 16.4 The Director's Cut debug overlay

A hotkey on the TV client that reveals true roles, live Hunter attention heatmap, every noise event with its source, and each player's private info feed. Plus **export match log to JSON**. You will not be able to debug this game without it, and you'll use it in every playtest post-mortem.

### 16.5 Playtest instrumentation

Cheap to add, disproportionately useful:

- Wall-clock time per phase (are we hitting 25–40 min?)
- **Speaking-time distribution** — the loudest player shouldn't own >35% of the debrief. If they do, the design isn't giving quiet players enough to say
- Post-round one-tap survey on the phone: *"Do you know who caused that?"* Yes/No/Guessing — this is the most direct measurement of R1 that exists
- **Second-screen rate** — the direct measurement of R2. Have someone watch the room during the Expedition and count how many of the five non-Crew players look away from the TV. **More than one is a warning; more than two means the broadcast has failed and D1 needs revisiting.**
- **Off-crew evil involvement** — ask evil players post-game: *"did you have anything to do while you weren't on the Crew?"* This is the R2b measurement.
- Post-game: *"Was that fun?"* and *"Did you understand your role?"*

---

## 17. Open questions

Beyond the four I'm asking directly, these need answers before v0.2:

**Structure**
1. Total session target — a tight 20 minutes, or a proper 40-minute event?
2. How many rounds/episodes, and is it fixed or does it end when a win condition fires?
3. Does the Episode Lead rotate, get elected, or get chosen by the previous Lead?
4. Is there an approval vote on the Crew (Avalon-style), or does the Lead just pick?

**The Expedition**
5. ~~Is the Breaker Sequence the only minigame in v1?~~ **Answered (D7): five tasks, deck designed to grow.** Follow-on: should task selection be random, or should the Lead choose the task *and* the crew?
6. Should the Crew be able to see each other's positions on their phones, or is even that too much telemetry?
7. Can a Crew member refuse to go / abandon the mission mid-round?
8. What happens if a Crew member dies mid-Expedition — do the remaining two carry on?

**Evil**
9. ~~Do evil players know each other from the start?~~ **Answered (D6): yes, plus live claim visibility.** Follow-on: does the Plant know the others *and* stay hidden from them, or is the panel fully symmetrical?
10. Can evil win by opening locks too, or are they strictly obstructive?
11. ~~Should the post-game reveal everything?~~ **Answered (D5): yes, the Reunion Special.** Follow-on: which awards make the cut, and do you want them voted on by the room rather than computed?
12. Should evil have a kill that isn't the Hunter, or is the Hunter the only lethal force?

**Presentation**
12b. Should the Producer's Note (force a 10s cutaway) go into v1 after all, or stay held back as the balance patch for R2b?
13. Is the chat fully generated, or do you want a curated writing pass? (§1.7 — for Jackbox, content *is* the product.)
14. Is there any voice/audio through the phones, or is the room the only audio channel?
15. Do we want confessional cams — a player privately records a 5-second reaction that airs later, possibly out of context? (Very on-theme, very cheap deception surface.)
16. Should the show have sponsors/ad breaks as a pacing device between rounds?

**Scope**
17. Does this share a codebase with the existing Run Robot Run mode, or fork?
18. What's the target device floor — a five-year-old Android in a browser?
19. Local network only, or does it need to work with someone joining remotely?
20. Is there any persistence — profiles, stats, a "season" across multiple games? (The Reunion's awards are the obvious hook for this.)
21. **Should evil get a private text channel?** My answer is no, and §7.5 explains why — but it's the most likely thing to get asked for after the first playtest, so it's worth deciding deliberately rather than under pressure.
22. Should the Episode Lead pick the task as well as the crew, or only the crew?
23. Do tasks scale with player count, or only with round number?

