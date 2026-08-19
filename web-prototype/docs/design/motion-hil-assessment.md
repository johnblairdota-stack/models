# Motion: HIL assessment and the adopted plan (2026-08-03)

John asked whether HIL (Wang et al., *Hybrid Imitation Learning for Dynamic Athletic
Control*, TOG 2026 — arXiv:2505.12619) could be used here. Assessed by `hil-research`
against both the paper and `github.com/jiashunwang/Hybrid-Motion-Imitation`.

## Verdict: not the method, not the repo — adopt its one structural idea, hand-rolled.

**The paper** is a training recipe for a physics-based RL controller: parallel
motion-tracking and adversarial-imitation environments sharing one policy. Requires
reference motion clips, Isaac Gym, 4096 parallel envs, ~4×V100, thousands of GPU-hours.

**The repo** is an UNOFFICIAL robotics port (created 2026-07-27, one week old): Isaac Sim +
Holosoma, targets a Unitree G1 robot, no pretrained checkpoints, box-climbing demos. It is
not the paper's graphics work and would have to be retrained from scratch on Linux.

**Three hard blockers, independent of cost:**
1. Imitation learning cannot bootstrap from nothing — this project's identity is zero
   motion assets (and AMASS mocap is non-commercial).
2. HIL trains one policy for ONE fixed body; this game's core mechanic is dynamic
   morphology (2⁴ socket configurations × gadget substitutions). Morphology-conditioned
   control is a separate unsolved research problem.
3. The place the game most needs motion — hunter stage 3's 2.6× two-headed six-armed
   quadruped — has no reference data in existence and no retarget path from human clips.

In-browser policy inference also fails perf arithmetic: the net is cheap but demands a
120 Hz articulated contact sim; the CPU budget has ~1.5 ms headroom for ALL game logic.

## The adopted plan (option c: hybrid idea inside locomotion.js's existing shape)

`Gait.pose` is the "tracking" term; a per-joint `Spring` correction layer driven by game
impulses is the "physics" term. `Spring` already exists in the file and already does this
for six body channels.

- **Stage 0 — DONE (critic-locomotion-1, 2026-08-03): WEAK 41, overturning the self-scored
  PASS 72.** Motion IS a real defect. Ranked findings: (1) **measured foot skate** — at each
  foot's per-cycle height minimum its horizontal velocity is 3.0–4.75 m/s in walk (travel
  2.55) and 6.7–10.15 m/s in run (travel 5.2); true zero-velocity instants fall near
  mid-swing, not at contact; (2) TURN's bank (16° roll, real in the math) is invisible at
  the station's near-head-on camera — staging, not gait math; (3) ONE-LEG lists only −4.1°,
  reads as idle balancing not desperate hobble; (4) no visible wound/socket at the emptied
  hip; (5) crawl/skate/down have never been rendered or critiqued (no --extra path).
  Wins: stride/knee/ankle timing, arm-leg opposition, genuine flight phase, real subtree
  removal.
- **Stage 1a (NEW, ranked above the reaction layer by the critic): foot plant.** A
  stance-lock/stance-velocity fix so the planted foot's world position holds while in
  contact — the most fundamental and most visible defect. The gait is phase-driven by
  distance travelled, so the fix likely lives in making stance-foot channels cancel root
  motion rather than full IK.
- **Stage 1** (half a day, one file, reversible): reaction layer — ~8 springs × 3 axes
  (`hips/spine/chest/neck` + four limb roots), an `impulse(channel, vec, gain)` method,
  additive pass at the end of `Gait.update()`. First caller: the rig `onChange('detach')`
  subscription in player.js (already knows the lost side) kicks laterally + yaw away from
  the loss. Verify: before/after strobe sheets judged BLIND by a critic; CPU unchanged at
  quality=medium. Known failure mode: the new layer fighting `_list` (locomotion.js:152)
  reads as wobble — fold `_list` into the layer, don't stack two.
- **Stage 2:** `balance` scalar → STUMBLE state (phase disturbance, torso pitch, arms
  thrown out) → DOWN as a brief ragdoll on the existing LimbField ballistics instead of
  the static authored pose.
- **Stage 3 (highest leverage, needs no paper):** a real quadruped gait for hunter stage 3
  — diagonal-couplet phase table as a sixth entry in a file that has five gaits (~150
  lines). Stage 3 currently runs the BIPED walk at 0.62 blend over a hunch pose.

If a critic ever files a motion complaint this cannot answer, the correct escalation is
licensed mocap retargeted to the rig — not policy training. HIL's advantage over mocap is
runtime generalisation, which evaporates the moment you bake.
