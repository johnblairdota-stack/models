# THE NIGHT — the board

One screen that sells and tracks the coupled playable night: eight phones as controllers, one TV
as the show, one server deciding who may know what, one mansion as the set. Three bands: **Pitch**
(why the coupling is the product), **Build** (phone / TV / session / layout, live cards from this
tree), **Verify** (the rule and the commands).

## Open it

```bash
cd web-prototype
npm run night:board        # -> http://localhost:5205
```

Plain static DOM — no build step, no canvas. Port **5205** on purpose: **5199 is The Desk's**
(its own worktree, live on John's machine) and **5201 sat inside `party-night`'s old port
cluster** — do not move this board onto either.

## Read it

Every card carries `data-status` (`done` / `open` / `finding`) and `data-gate` (the harness file
that proves the claim). `finding` means measured-and-deliberately-unfixed (tag-census: the fix is
inside a locked rule and needs John). `WANTED` is the one honest non-file gate value, for an OPEN
card whose instrument does not exist yet.

## Verify

```bash
npm run gate:night-coupling    # the coupled walk + the board rules (NC1–NC10d)
npm run gates:party            # the full chain CI runs, night-coupling included
```

**A DONE card cannot skip verify.** `harness/night-coupling.mjs` NC10 reads this board's
`index.html`: a card with no gate, a DONE card whose gate is not in the `gates:party` chain, or a
`data-verify="skip"` marker anywhere turns the gate red — and NC10c proves the checker itself can
fail, by feeding it all three violations.

The gate's other half is the walk this slice existed for: a real server on :5232, a TV and three
handsets, guide pins → TV told (and may not draw it) → world walks → camera lights →
recap reads CAM LIT — plus a dark control where the job never lands and the card must honestly
read CAM DARK.
