---
name: rrr-slice
description: Write a slice plan that a cheaper model can execute correctly, and route work between planning, building, critiquing and diagnosing. Use when breaking work into agent-sized pieces, deciding which model should do a task, or writing a brief for a subagent.
---

# Writing a slice, and routing the work

Measured on this project, not assumed.

## The routing rule: Opus decides, Sonnet executes and judges

| work | model | why |
|---|---|---|
| Design, spec, architecture | Opus | — |
| **Diagnosis** — *why* is this invisible/wrong | **Opus** | cannot be pre-planned; the finding **is** the work |
| Writing the plan of specific edits | Opus | this is where most of the value lands |
| Applying those specific edits | Sonnet | cheap and reliable when the decisions are made |
| Critique, blind gates, verdicts | Sonnet | 6 runs, every one found real defects, ~⅓ the cost |

**The line is decided-vs-undecided, not builder-vs-critic.** Measured:

| brief given to Sonnet | tokens | outcome |
|---|---|---|
| a 9-item **defect list** ("fix the head, fix the shoulders…") | **462k** | deleted the character's signature element while believing it had done the item |
| a **written plan** with the changes decided | 235–265k | all changes landed, no regression |

Sonnet given a defect list still has to decide *how*, and that is where it fails. Given
decisions, it executes them faithfully and cheaply.

**Corollary, and it is the sharp edge:** *plans buy compliance, not quality.* Everything a
plan specifies comes out right; everything it leaves unsaid comes out badly. A slice landed
six specified shader changes perfectly and still scored WEAK 48 because its specimen floated
above the floor, the frame was cropped, and the specular clipped to white — none of which the
plan mentioned. **Specify presentation, not just mechanism.**

## What a good slice contains

Write it to `docs/slices/task-<name>.md`. See `task-walnut.md` and `task-gadget-mount.md` for
worked examples.

1. **Exact file ownership** — "you may edit these two files, nothing else". Name the files
   other agents own so it does not collide.
2. **Why this slice matters** — one paragraph. What it unblocks.
3. **The changes, numbered, with the decisions already made.** Where a number is given, say
   it is the number to use. Where a technique already works elsewhere in the codebase, point
   at it and say *carry the technique, do not import* if that file belongs to another system.
4. **The bar** — the exact reference file paths, and the command to tile render against
   reference.
5. **Presentation requirements** — framing, grounding, exposure. Point at the composition
   rules rather than restating them.
6. **The traps** — reserved words, backticks in template literals, the `fbmT` narrow bell,
   `Edit` over scripted replacement. These have each cost real time.
7. **Verification** — the exact commands, and *what to look at* in the result.
8. **A regression gate** if the file has dependants: baseline shots before, same shots after,
   confirm nothing broke.
9. **"If a stated fact turns out to be wrong, say so in your report rather than diverging
   silently."** This has caught genuine spec errors.

## Writing the plan is itself the highest-value step

Reading a file closely enough to write its plan finds things a defect list never would. One
walnut plan surfaced four bugs before any agent ran: a fourth instance of the `fbmT` gate bug,
a `walnutBoards()` that was a panel grid rather than a floor, book-matching that was actively
backwards, and missing gilt entirely.

## Briefing an agent

Keep the spawn prompt short and point at the docs — do not restate them:

> Read `HANDOFF.md` first, then `BUILD_GUIDE.md` §4b, then `docs/slices/task-<name>.md` and do
> exactly what it says. That slice is a plan, not a defect list: the decisions are made and the
> numbers are the numbers to use. If a stated fact is wrong, say so rather than diverging.

Tell a critic what was *claimed* and that it is a claim to verify — never that it is fixed.
Contaminating the critic destroys the only independent signal you have.

## Guard against the loop's own failure modes

- **A builder must never grade its own fix.** Every time that happened here a critic later
  overturned it. Ceiling is `PASS`; only `critic-*` sets `WOWED`.
- **Verdicts go stale.** A critic judges a frame, a builder changes it, and the score now
  describes something that no longer exists — this understated one piece by 33 points and
  silently corrupted every status report until `audit.mjs` started flagging it.
- **One owner per coupled concern, run sequentially.** Parallel agents on a coupled system
  break each other's assumptions: a `setPose` wrote into limbs another agent had detached, and
  a game frame rendered flat monochrome amber because materials, lighting and post each had a
  different owner and nobody owned the look.
- **Agents die mid-task.** Their file edits survive; their reasoning does not. Slice docs mean
  a death costs one slice rather than an exploration — and always check what landed before
  assuming nothing did.
