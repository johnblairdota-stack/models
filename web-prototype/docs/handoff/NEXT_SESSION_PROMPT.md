# Paste this to start the next session

```
Read docs/handoff/mesh-pipeline.md in full before doing anything. It is short and it is
the state of play.

⚠️ The authority for asset work is docs/ASSET_PIPELINE_PLAN.md. It SUPERSEDES the
`rrr-pipeline` skill, which describes the old build-then-critique-forever loop. If you
cannot find a document I name, STOP AND ASK — do not substitute the nearest thing you
find. That exact substitution cost ~20 wasted rounds last session.

Context you need in one line: the player is now a generated, Meshy auto-rigged, skinned
character (10,378 tris, 24 bones, 9 clips) that measurably beats the old hand-built one
against the art, and it carries an identity kit — face, neck, ear discs, mint caps —
parented to bones. The hunters were rebuilt as "more parts, not scaled up".

Ground rules that are not negotiable:
- I judge how things look. You do things that can be checked. Don't run long critique
  loops to decide whether something is attractive — show me and ask.
- Cap any iteration loop at three rounds. If it isn't there, the problem is upstream.
- A number hitting its target is NOT evidence the thing looks right. Crown height cannot
  tell a stoop from a squat. Show me a picture.
- Sweep every free parameter of a measurement (crop split, reference crop, band) before
  quoting it. A wrong crop prints a complete, plausible, wrong table.
- I don't use a terminal. Give me double-clickable .bat files and URLs, as prose — never
  a shell command in a code block.
- Verify before claiming. Every guard needs a control you have watched fail.

Start by telling me what you think the highest-value next move is and why, then wait.
```

## Pick one to append, depending on what you want done

**Finish the identity kit**
```
First job: the visor plate runs to the head's edge where the art has a white bezel around
it, and the ear discs read smaller than the art's. Fix both against the BASELINE row of
Dev Art 1785300149293. Then add the chest wordmark, which is not started.
```

**Locomotion**
```
First job: the generated player has real Walking and Running clips. char.locomotion fakes
gait procedurally and sits at WEAK 57 with four open hates. Compare them and tell me
whether the procedural gait still earns its place.
```

**Hunters from player parts**
```
First job: under the "more parts" model the hunter is built from player-sized parts, so
the skinned player mesh is the raw material for all three stages. Stage 3's rider is still
the old small tucked head and should be full size. Work out what that costs.
```

**Next asset through the pipeline**
```
First job: run one NEW asset end to end — concept image, multi-view, Meshy, conditioning,
in-engine — and time each step. We only ever tested the pipeline on the player, which had
locked art to generate from. A prop with no existing art is the real test.
```
