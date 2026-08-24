# PRIME TIME — the social round

The half of the game that happens in the chairs. Written 2026-08-19.

**Scope contract.** `web-prototype/docs/design/party-loop.md` owns the Expedition (pair, runner/guide, task, hunter, being taken). This file owns everything else: casting, debrief, nomination, vote, execution, verdict, the event log, the Reunion and the win machine. Where the design bible (`rrr-social-deception-mode.md`) disagrees on crew size, the dead, the hammer or evil count, `party-loop.md` wins — see `rrr-prototype-audit.md` §4, conflicts C1–C4.

Locked here and assumed everywhere below: **evil 1 at 4–5 players, 2 at 6–8** · **deaths never reveal alignment during play** · **the dead are out of the mansion permanently and become the stream chat, no ghost vote in v1** · **executions are swung by the nominator** · **the party mode does not use `run.js`'s WINDDOWN/DETONATION**.

---

## 1. The round loop

An **episode** is one round. The show never leaves the air; the phases are a shooting schedule, not a day/night cycle.

| # | Phase | Length | What happens | Phones |
|---|---|---|---|---|
| 1 | `CASTING` | 45 s | Task and wing announced first, then the pair is voted in (§2) | ballot |
| 2 | `EXPEDITION` | 90 s | Runner + guide in the mansion. Everyone else watches the TV | runner: FPS · guide: flyover · rest: reaction bar |
| 3 | `RECAP` | 10 s | Produced recap reel, cut from the log (§5) | dark |
| 4 | `DEBRIEF` | 75 s | Talking in the room. Chat drops its five tips | claims/nameplates only |
| 5 | `RECKONING` | 45 s, +15 s per nomination, hard cap 90 s | Nominations and counter-nominations (§3) | nominate |
| 6 | `VOTE` | 25 s | One simultaneous ballot over all standing nominees | vote |
| 7 | `EXECUTION` | 20 s, skipped if nobody cleared threshold | The nominator swings the sledgehammer, on TV | dark |
| 8 | `VERDICT` | 15 s | RENEWED / CANCELLED / SEASON FINALE (§4) | dark |

**Base round 325 s (5:25), worst case 370 s (6:10).** **Episode 1 skips phases 5–8** — no eviction in the premiere, because nobody has anything to go on and the first round's job is teaching the loop. Premiere episode = 3:40.

**Session budget.** `PREMIERE` (join, seat the circle, deal roles, read the rules) 2:30 + episode 1 3:40 + episodes 2..N at 5:25 + `REUNION` 4:00 → 4 episodes **26:25** · 5 **31:50** · 6 **37:15**. `EPISODE_CAP = 5` is what keeps the worst case inside 40 minutes. The match ends the moment a win predicate fires (§6), so most sessions land at 4–5.

---

## 2. Casting: how the pair is nominated and voted for

The task and the wing are announced **before** anyone is picked. Casting is an argument about a specific job, not a popularity contest.

**The ballot.** Every living player makes exactly two taps: first tap = their **runner** pick, second tap = their **guide** pick. Two distinct living players. Self-picks are legal and loud. Abstain is legal; an unsubmitted ballot at the bell is an abstain.

**The tally.** Each ballot adds 1 to the runner-score of its first pick and 1 to the guide-score of its second. Highest runner-score takes the runner chair; highest guide-score of the remainder takes the guide chair. If one player tops both, they take **runner** and the guide chair falls to the next guide-score.

**Ties** resolve deterministically and publicly, in order: (1) fewer expeditions this game; (2) fewer rounds since last expedition — i.e. take the staler player; (3) `seededPick(matchSeed, 'cast:'+ep, tied)`. Nothing is ever re-run and nothing waits on a human.

**Rotation lockout.** Last episode's runner may not be runner; last episode's guide may not be guide. They may swap chairs. The lockout is void whenever fewer than 4 players are alive, so it can never make casting impossible.

**Refusal.** Once per game, a player voted into a chair may `REFUSE THE CHAIR`. Public, attributed, permanent, and logged. The runner-up in that slot takes it. This is the veto, re-pointed: it is a statement about a job you were given, not about somebody else's pick, and it is a lovely thing for a good player to do at exactly the wrong moment.

**Ballots are sealed until the bell, then aired in full and attributed.** Who you sent, and who you refused to send, is the cheapest deduction fuel in the game and it costs nothing to compute.

---

## 3. Nomination, vote, execution

1. **Who may nominate.** Any living player, **once per episode**. The dead never nominate (no ghost vote in v1). The robot stands up and points; attributed, public, permanent.
2. **Who may be nominated.** Any living player, **at most once per episode**. No self-nomination. A nominee may spend their own nomination to counter-nominate anyone, including their accuser.
3. **Standing-nomination cap: 3 per episode**, first tap wins. Keeps `RECKONING` bounded.
4. **The window.** `RECKONING` opens at 45 s and gains 15 s per nomination made, capped at 90 s total. It closes early once every living player has spent their nomination. Each nomination buys the accused a 10 s confessional-cam pitch on the TV; nominators get the same, first.
5. **The vote.** One simultaneous ballot in `VOTE`: every living player picks exactly one standing nominee, or `NO ONE`. Non-voters and timeouts count as `NO ONE`.
6. **Threshold: strictly more than half of *living* players** — not half of votes cast. Abstaining therefore protects the accused, which is a real choice.
7. **Ties can never execute.** Because the threshold is a strict majority of the living, at most one nominee can clear it. If nobody clears it, nobody dies and the TV says so. This is why the tie rule needs no arithmetic: it is a property of the threshold.
8. **At most one execution per episode.**
9. **Execution.** The single nominator of the executed player picks up the sledgehammer and swings it on television. There is exactly one nominator because a player can be nominated only once. If the nominator was themselves taken during this episode's expedition, the Showrunner swings and the log records `executioner: 'SHOWRUNNER'`.
10. **No reveal.** The nameplate turns face-down. Nothing about alignment, ever, until the Reunion.
11. **The executed player is out of the mansion permanently**, becomes the chat, and keeps talking out loud in the room because they are sitting right there.

---

## 4. The Verdict — exactly what leaks

30 seconds of the Showrunner, at the end of every episode. Precision here is the whole of P6.

**Aired, attributed, permanent:**

- **Status** — one of `RENEWED` / `CANCELLED` / `SEASON FINALE`.
- **Cameras** — `n of N lit`, and which terminal stayed dark.
- **Casualty** — who left the mansion, and by which of the two visible causes (`TAKEN` / `EXECUTED`). Both were witnessed live on TV, so hiding the cause would be a lie; hiding the alignment is not.
- **Hunter stage** — 1 / 2 / 3, the visible silhouette. It grows on **every** take, good or evil.
- **Incidents** — a bare number, no attribution. Defined as, over this episode's log: `noise.emitted` with `loud ≥ INCIDENT_LOUD` and `sourceType != 'PICK'`, plus every `hunter.arrival` in a room holding no crew member, plus every `sabotage.fired`.
- **The full vote record** — casting ballots and execution votes, with names.

**Withheld until the Reunion (`vis: SEALED`, never leaves the host process):**

- Every alignment, living or dead. Every role. Every unpublished claim draft.
- **The feed count.** Evil's actual progress is the number of *good* players the Hunter has taken. The public gauge is the hunter's stage, which also grows when an **evil** runner is taken — so the gauge is a deliberately lossy proxy, and evil losing a partner looks exactly like evil winning.
- Which incidents had an evil cause, who spiked attention, what was rigged and when.
- Chat authorship, and the truth mask of the five tips beyond the stated count.
- Anything the Broadcast Director chose to cut away from, and that it chose.

---

## 5. THE EVENT LOG

The Reunion, the recap reel, the Director's Cut, the balance sim and every post-game stat are queries over one append-only log. Nothing else is a source of truth. Land it at M3.

### 5.1 Envelope — every event, no exceptions

```js
{
  seq:     123,             // monotonic int, primary key. Append-only. Never rewritten, never deleted
  t:       412.83,          // seconds since match start, from the authoritative clock
  ep:      3,               // episode index. 0 = PREMIERE
  phase:   'RECKONING',     // the phase at append time
  type:    'nom.made',      // dotted, family.verb — see 5.3
  actor:   'p4',            // playerId | 'SHOWRUNNER' | 'HUNTER' | null
  subjects:['p7'],          // playerIds this is about. Always an array
  vis:     'PUBLIC',        // PUBLIC | CREW | EVIL | P:<pid> | DIRECTOR | SEALED
  weight:  2,               // 0..3 editorial salience. The recap and the Director both select on this
  rngSalt: null,            // the salt string, if this event consumed randomness
  data:    { ... }          // type-specific, below
}
```

### 5.2 The four invariants that make this worth doing

1. **`vis` is the *only* input to the per-socket filter.** A phone receives an event iff `vis === 'PUBLIC'`, or `vis === 'CREW'` and it is on this episode's pair, or `vis === 'EVIL'` and it is evil, or `vis === 'P:<its own id>'`. `DIRECTOR` goes to the TV only. `SEALED` goes nowhere until the Reunion. V12, V21 and V22 become one property test over one function.
2. **The Reunion is the same replay with the filter switched off.** No second data path, so it cannot drift from the truth and it cannot leak early.
3. **Every random draw records its salt** and every salt is derived from the match seed, so the whole match replays from one integer — the same discipline `run.js` already enforces for the exit (run.js:43–48).
4. **Every query must tolerate a truncated log**, because `SKIP TO REUNION` is a shipping feature.

### 5.3 Event families

| Family | Types | `data` (abridged) | `vis` |
|---|---|---|---|
| `match.*` | `created` `seeded` `roles_dealt` `ended` | `{players[], count, evilCount, cameraTarget, feedTarget, episodeCap}` · `{seed}` · `{assignments:{pid:role}}` · `{winner, path}` | PUBLIC except `roles_dealt` = **SEALED** |
| `player.*` | `joined` `left` `reconnected` `seated` `claim_draft` `claim_set` | `{name, seat}` · `{text}` | PUBLIC; `claim_draft` = **EVIL** (D6's live drafts) |
| `phase.*` | `entered` `left` | `{phase, plannedMs, actualMs, extendedBy}` | PUBLIC |
| `cast.*` | `task_announced` `ballot` `tally` `pair_set` `refused` | `{taskId, wing}` · `{runnerPick, guidePick}` · `{runnerScores, guideScores, tiebreak}` · `{runner, guide}` · `{slot}` | `ballot` SEALED until `tally`, then PUBLIC |
| `run.*` | `started` `room_entered` `blow` `channel_open` `terminal_reached` `camera_lit` `camera_dark` `ended` | `{room}` · `{cell, depth}` · `{terminalId, cameraId}` · `{reason:'bell'\|'taken'\|'abort'}` | PUBLIC |
| `run.pose` | one event per second | `{poses:[{id,x,z,yaw}], hunter:{x,z,state}}` | DIRECTOR |
| `guide.*` | `call` `ping` | `{value:'CLEAR'\|'HOLD'\|'GO', room}` · `{room}` | CREW |
| `noise.*` | `emitted` | `{room, loud, sourceType:'PICK'\|'MISS'\|'COLLAPSE'\|'SPRINT'\|'CHAT'\|'RIG', causedBy, causedByEvil}` | PUBLIC, but `causedBy` / `causedByEvil` **SEALED** |
| `hunter.*` | `state` `arrival` `grab` `rescue` `take` `stage` | `{from,to}` · `{room, cause, causedByEvil}` · `{rescuer, byNoiseSeq}` · `{victim}` · `{stage}` | PUBLIC; `cause` fields **SEALED** |
| `sabotage.*` | `armed` `fired` `declined` | `{kind:'RIG'\|'SPIKE'\|'HOLD', target, armedSeq}` | **SEALED** |
| `chat.*` | `tips_set` `posted` `tip_locked` | `{tips[5], statedTrue, truthMask}` · `{handle, text, author, generated}` | PUBLIC; `truthMask`, `author`, `generated` **SEALED** |
| `nom.*` | `opened` `made` `pitch` `extended` `closed` | `{nominator, accused}` · `{who, seconds}` | PUBLIC |
| `vote.*` | `opened` `cast` `tallied` | `{voter, choice}` · `{counts, living, threshold, result:'EXECUTE'\|'NONE', reason}` | `cast` SEALED until `tallied`, then PUBLIC |
| `death.*` | `recorded` | `{player, cause:'TAKEN'\|'EXECUTED', executioner, ep, alignment}` | PUBLIC; `alignment` **SEALED** |
| `verdict.*` | `announced` | `{status, camerasLit, cameraTarget, incidents, hunterStage, casualties[]}` | PUBLIC |
| `win.*` | `checked` `fired` | `{predicate, value, target, fired}` · `{side:'GOOD'\|'EVIL', path}` | `checked` SEALED; `fired` PUBLIC |
| `cut.*` | `to` `away` | `{subject, reason, deliberate}` | DIRECTOR, PUBLIC at Reunion |
| `award.*` | `granted` | `{award, player, value, querySeq[]}` | PUBLIC (Reunion only) |
| `host.*` | `paused` `kicked` `skip_to_reunion` | — | PUBLIC |

`death.recorded` is the one canonical death. Nothing else may be treated as a death, so every count in the game — parity, feed, awards, the roll call — reads one table.

---

## 6. Win conditions

`WIN_TARGETS`: `cameraTarget` = 3 at 4–5 players, 4 at 6–8. `feedTarget` (good players taken by the Hunter) = 2 at 4–5, 3 at 6–8.

| # | Predicate | Checked | Fires |
|---|---|---|---|
| W1 | no living evil | after every `death.recorded` | `SEASON FINALE` — good |
| W2 | `camerasLit == cameraTarget` | on `run.camera_lit`, at the end of EXPEDITION | `SEASON FINALE` — good |
| W3 | goods taken by Hunter `>= feedTarget` | on `hunter.take`, at the end of EXPEDITION | `CANCELLED` — evil |
| W4 | living evil `>=` living good | after every `death.recorded` | `CANCELLED` — evil |
| W5 | `ep == EPISODE_CAP` and cameras short | at `VERDICT` of the final episode | `CANCELLED` — evil |
| W6 | host `SKIP TO REUNION` | any time | `ABANDONED` — no side, Reunion still runs in full |

**Resolution order is log order.** Predicates are evaluated by a reducer folded over the log, and the first one that goes true ends the match — so a camera lit at `seq 512` beats a take at `seq 513`, and the argument about precedence is decided by timestamps rather than by a table. For events appended in the same tick, the reducer order is W1, W3, W2, W4, W5.

W1 and W3 cannot collide: only the runner is exposed, so a single take is either a good or an evil player, never both. Every check appends `win.checked` (SEALED) whether or not it fires, which is what makes the balance sim's win-rate reports free.

`VERDICT` is the only feedback loop during play: `RENEWED` tells good that evil is still alive, and tells them nothing about the person they just destroyed.

---

## 7. THE REUNION SPECIAL — 4 minutes

Every beat is a query. If a beat cannot be written as a query over §5, the schema is wrong and this is where you find that out.

| | Beat | Length | Query |
|---|---|---|---|
| 1 | **Roll call** — the dead retake their chairs, nameplates flip one at a time: true role beside final claim, with claim history | 75 s | `match.roles_dealt` ⋈ last `player.claim_set` per player ⋈ `death.recorded` |
| 2 | **The Director's Cut** — the decisive episode replayed raw, sabotage captioned for the first time, every cutaway annotated | 60 s | `run.pose` where `ep == decisive`, overlaid with `sabotage.*` and `cut.away{deliberate}`. Decisive = the episode containing `win.fired`, else the last episode holding a `death.recorded` |
| 3 | **The awards** | 60 s | §7.1 |
| 4 | **The chat, unmixed** — the final scroll recoloured: which lines were dead humans, which the Showrunner generated | 45 s | `chat.posted`, `author` and `generated` unsealed |

### 7.1 Awards, and the query that computes each

| Award | Query |
|---|---|
| **Most Trusted** | living-or-dead good player minimising `count(nom.made{accused:P}) + count(vote.cast{choice:P})`; tiebreak on most `cast.pair_set` appearances |
| **The Mark** | good player maximising `count(vote.cast{choice:P})` |
| **Best Liar** | evil player maximising `(episodes alive) − count(nom.made{accused:P})` |
| **Loudest Robot** | player maximising `sum(noise.emitted{causedBy:P}.loud)` |
| **The Klutz** | good player maximising `count(noise.emitted{causedBy:P, causedByEvil:false, sourceType in ('MISS','COLLAPSE')})` |
| **Cold Blood** | any P with `death.recorded{executioner:P, alignment:EVIL}` where P is evil — bussed a teammate on television |
| **The Liar in the Ear** | guide maximising the count of `guide.call{value:'CLEAR', room:R}` followed within 5 s by `hunter.arrival{room:R}` |
| **Dead Air** | player with the fewest events of any kind attributed to them (`actor:P`) across the whole log — the consolation prize, and the direct read on whether the design is failing quiet players |

Each `award.granted` carries `querySeq[]`, the seq numbers that earned it, so the TV can cut straight to the footage that proves the award. That single field is the difference between a list of names and the bit people quote afterwards.

---

## 8. How this extends `web-prototype/src/game/run.js`

Read the file first; it is already server-shaped and the party mode should inherit that shape rather than fork it. **Zero edits to `run.js` are required.**

**What is reused as-is**

- **The seeded-selection block.** `hash32` (run.js:120), `seedRand` (run.js:144) and `seededPick` (run.js:147) are pure, dependency-free and already the project's law for anything two machines must agree on. Every party draw goes through them with a named salt: `'role:'+ep`, `'task:'+ep`, `'tips:'+ep`, `'cast:'+ep`. The header's rule — the selection is a pure function of the seed and is never transmitted (run.js:43–48) — is exactly the discipline that keeps roles off the wire.
- **`chooseExit(seed, sites)` (run.js:166) and `LOCKS` (run.js:103–107)** pick the episode's terminal site and what is holding it shut. Same function, new content pool.
- **`RunState.down(id)` (run.js:326)** is already "the Hunter took this player" — reuse it verbatim for a take, then append `death.recorded` alongside it.
- **`reset(seed)` (run.js:354)** is the per-episode reshuffle, and its own comment says so (run.js:349–353): call `reset(matchSeed + ':' + ep)` between episodes.

**What is deliberately not used**

- `WINDDOWN` and `DETONATION` and `BOMB_SECONDS` (run.js:64). This costs nothing to avoid, and the reason is mechanical rather than a matter of care: `tick()` only decrements the bomb from inside `WINDDOWN` (run.js:272–274), and the **only** transition into `WINDDOWN` is the first `escape()` (run.js:312–317). An expedition that never calls `escape()` can never reach the bomb. The party mode ends its 90 s expedition with `finish({ reason: 'bell' })` (run.js:342) instead — which lands in `RESULTS` through the same `_setPhase` path as everything else.
- `results()` (run.js:235–243) ranks survivors by time-to-escape. The party mode's scoreboard is the Reunion; keep `results()` for expedition-local stats only.

**What is new, in `src/game/episode.js`, next to `run.js` and built to the same rules**

- `EPISODE_PHASE` / `EPISODE_ORDER` as a **sibling** enum, not additions to `PHASE` (run.js:52–58). *(This narrows the bible's "add entries to its `PHASE`" note, and the reason is in the file:* `syncPhase` validates against `PHASE_ORDER` (run.js:378), so social phases added to that array become legal transitions for survival mode too, and `_setPhase` (run.js:417–424) special-cases two of the existing four.) One `RunState` is composed inside each episode for the 90 s expedition; the social phases live on `EpisodeState` around it. Still one machine per concern, not two machines for one concern.
- Every mutator early-outs without `authority`, copying the guard at run.js:266, 290, 327, 343 and 355. A phone can be *told* the vote closed; it cannot close it.
- One listener set, `onPhase` (run.js:247) / `_emitPhase` (run.js:426–428), and a `syncPhase` + `applySnapshot` pair shaped like run.js:377–413, so a phone that locks during `DEBRIEF` and comes back in `VOTE` lands in the right state with one call and no special case.
- **The one place the pattern must change:** `serialize()` (run.js:389–395) produces a single global snapshot. The party snapshot is **per-socket and filtered by `vis`** (§5.2). Write it as `snapshotFor(playerId)` and never expose an unfiltered serializer to the transport layer at all.
- `src/game/log.js` — the append-only log, fed by subscribing to `onPhase` / `onEscape` from outside. `run.js` never learns that a log exists.

---

## 9. Risks this spec introduces

| # | Risk | Mitigation / measurement |
|---|---|---|
| **S1** | **Evil's win arrives with no warning.** The feed count is sealed, so `CANCELLED` can feel arbitrary to a good player who thought they were fine | The hunter's stage is the gauge, plus a rising `RATINGS` sting each time it grows. Measure at M3 with the post-game question *"did you see it coming?"* |
| **S2** | **Two votes per episode is a lot of phone.** Casting ballot plus execution ballot, five times | Casting is two taps and 45 s. If second-screen rate rises during `CASTING`, merge it into the recap of the previous episode |
| **S3** | Nomination cap of 3 may bind at 8 players | It is a constant; move it, don't redesign around it |
| **S4** | `run.pose` at 1 Hz may be too coarse for a watchable Director's Cut | Raise to 5 Hz for the pair only; ~1,350 events/episode is still nothing |
