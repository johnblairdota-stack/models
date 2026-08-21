# Two `docs/design/` directories — you are probably in the wrong one

**If you came here looking for `rrr-task-deck.md`, `rrr-roles.md`, `rrr-social-round.md`,
`rrr-build-brief.md`, `rrr-gates.md`, `rrr-phone-ux.md`, `rrr-broadcast.md`, `rrr-netplay.md`,
`rrr-paper-prototype.md`, `rrr-prototype-audit.md` or `rrr-social-deception-mode.md` — they are
not here and they are not missing.** They live one directory up from the prototype:

```
<repo root>/docs/design/rrr-*.md          <-- the party-mode design corpus
<repo root>/web-prototype/docs/design/    <-- you are here: the older engine corpus
```

## Why this is confusing, stated plainly

Source comments in `web-prototype/src/` cite design docs by a path **relative to the repo root**:

```js
 * `docs/design/rrr-task-deck.md` task 1.        // <-- repo root, NOT web-prototype/
 * `docs/design/party-loop.md`: "If the hunter…"  // <-- web-prototype/, and it resolves
```

Both forms are written identically, and from inside `web-prototype/` **one of them resolves and
the other does not**. Because this directory exists and is full of real files, the usual check —
`ls docs/design/` after a `cd web-prototype` — returns a populated directory with no `rrr-*` in
it. That looks exactly like a corpus that was never committed.

**It has been filed as a missing-docs process failure twice.** Both reports were wrong, and both
were reasonable: an empty result would have prompted a second look, and a wrong-but-plausible
result did not.

## What is in each

| Directory | Corpus | Examples |
|---|---|---|
| `<repo root>/docs/design/` | The **party / social-deception mode**. Roles, the social round, the task deck, the phone UX, broadcast, netplay, the gate plan, the prototype audit, and the design bible. | `rrr-roles.md`, `rrr-social-round.md`, `rrr-task-deck.md`, `rrr-social-deception-mode.md` |
| `web-prototype/docs/design/` (here) | The **engine and the single-player modes**, plus `party-loop.md`, which the corpus above defers to for the Expedition. | `party-loop.md`, `escape.md`, `dig.md`, `procedural-map.md`, `house-packing.md` |

The split is not accidental: `rrr-social-round.md`'s scope contract points *into* this directory
by full path — *"`web-prototype/docs/design/party-loop.md` owns the Expedition (pair, runner/guide,
task, hunter, being taken)"* — so the two corpora cite each other across the boundary and both
sets of paths are correct from the repo root.

## The cheap habit that avoids all of this

Resolve design-doc citations from the **repo root**, not from `web-prototype/`:

```bash
cd "$(git rev-parse --show-toplevel)" && ls docs/design/
```

Nothing has been mass-edited to paper over this. Rewriting ~29 citations across 24 files to add a
`../` would make them wrong from the repo root instead, and would have to be redone the next time
a file moves. The ambiguity is documented here and in the root `README.md` instead.
