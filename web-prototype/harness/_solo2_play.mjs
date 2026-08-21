/**
 * _solo2_play — drive a scripted SOLO run through `views/game.js`'s own simulation order.
 * The steering is the same waypoint rule `_mr8_full.mjs` uses for the party expedition, so the
 * two modes are driven by the same walker and any difference is the MODE, not the driver.
 */
import { makeWorld, THREE, RULES, FINAL_STAGE } from './_solo1_boot.mjs';
export { makeWorld };

const DT = 1 / 60;

/**
 * Aim at the next portal centre, then 1.5 m past it into the far room, then the goal. The
 * "past it" leg only engages once the body is inside the doorway, which is what stops the
 * side-flip oscillation `_mr7` documents.
 */
function legFor(room, pos, target) {
  const hops = room.pathPortals(pos, target, 0.6, RULES.PASS_H.robot);
  const h = hops[0]; const c = h && h.centre;
  if (!(c && Number.isFinite(c.x) && Number.isFinite(c.z))) return { x: target.x, z: target.z };
  const n = h.normal || { x: 0, z: 1 };
  const here = room.spaceAt(pos)?.id ?? null;
  const far = h.a === here ? h.b : h.a;
  const fs = room.spaces.find((s) => s.id === far);
  const fc = fs ? { x: (fs.x0 + fs.x1) / 2, z: (fs.z0 + fs.z1) / 2 } : target;
  const side = Math.sign((fc.x - c.x) * n.x + (fc.z - c.z) * n.z) || 1;
  const d = Math.hypot(c.x - pos.x, c.z - pos.z);
  if (d > 1.4) return { x: c.x, z: c.z };
  return { x: c.x + n.x * side * 2.2, z: c.z + n.z * side * 2.2 };
}

/**
 * Drive `W` with a list of orders. Each order is
 *   { kind:'goto', at:{x,z}, within, max }              walk there
 *   { kind:'take', at:{x,z}, within, max }              walk there then press E until taken
 *   { kind:'chew', panel, stand:{x,z}, face:{x,z}, max } stand and swing until it opens
 * Returns a log of what happened, with the run's own outcome.
 */
export function drive(W, orders, { hunterOn = true, seconds = 600, onFrame = null, flee = null } = {}) {
  let fleeing = false;
  const { room, player, hunter, noise, weapons, limbField, run, exits, outThrough } = W;
  let t = 0, i = 0, frames = 0;
  const ev = { kills: 0, stage: [], bang: 0, commit: 0, wallHits: 0, panelTouched: new Set(),
    swings: 0, brokeThrough: 0, escapes: [], phases: [], denies: 0, fleeFrames: 0 };
  hunter.onKill = () => { ev.kills++; };
  hunter.onStage = (a, b) => ev.stage.push(`${a}->${b}@${t.toFixed(1)}`);
  hunter.onBang = () => ev.bang++;
  hunter.onCommit = () => ev.commit++;
  weapons.onWallHit = (panel) => { ev.wallHits++; ev.panelTouched.add(panel.id); };
  run.onEscape((r) => ev.escapes.push({ id: r.id, at: +r.at.toFixed(2) }));
  run.onPhase((p, from) => ev.phases.push(`${from}>${p}@${run.t.toFixed(2)}`));

  const trail = [];
  let order = orders[0], orderT = 0, done = [];
  const N = Math.round(seconds / DT);
  for (let f = 0; f < N; f++) {
    t = f * DT; frames++;
    if (!order) break;
    orderT += DT;

    let move = { x: 0, y: 0 }, runFlag = false, yaw = player.aimYaw;
    let advance = false;

    if (order.kind === 'goto' || order.kind === 'take') {
      const tgt = order.at;
      const d = Math.hypot(tgt.x - player.pos.x, tgt.z - player.pos.z);
      if (d <= (order.within ?? 1.0)) {
        if (order.kind === 'goto') advance = true;
        else {
          // press E, exactly the way `liveInput` does
          const got = player.interact(limbField, W.E_REACH ?? 1.25);
          if (got || player.sledge?.equipped) { order.took = true; advance = true; }
          else if (orderT > (order.max ?? 6)) advance = true;
        }
      } else {
        const leg = legFor(room, player.pos, tgt);
        yaw = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
        move = { x: 0, y: 1 }; runFlag = !!order.run;
      }
      if (orderT > (order.max ?? 120)) { order.timedOut = true; advance = true; }
    } else if (order.kind === 'chew') {
      const st = order.panel.state;
      const d = Math.hypot(order.stand.x - player.pos.x, order.stand.z - player.pos.z);
      if (d > 0.55) {
        const leg = legFor(room, player.pos, order.stand);
        yaw = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
        move = { x: 0, y: 1 }; runFlag = !!order.run;
      } else {
        yaw = Math.atan2(order.face.x - player.pos.x, order.face.z - player.pos.z);
        const r = player.attack(t);
        if (r) { ev.swings++; order.blows = (order.blows ?? 0) + 1; }
      }
      if (!order.panel.blocksMovement()) { order.opened = t; advance = true; }
      // a blind probe: spend `probe` blows and move on if the door has not yielded
      else if (order.probe && (order.blows ?? 0) >= order.probe) { order.probed = true; advance = true; }
      if (orderT > (order.max ?? 180)) { order.timedOut = true; advance = true; }
    } else if (order.kind === 'walkout') {
      const leg = order.at;
      yaw = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
      move = { x: 0, y: 1 }; runFlag = true;
      if (orderT > (order.max ?? 20)) { order.timedOut = true; advance = true; }
    }

    /**
     * A plausible competent player: break off and run when the Hunter has COMMITTED and is
     * close, resume the job when it is clear again. `flee-survival.mjs` establishes that
     * running away works; this is that finding turned into a policy.
     */
    if (flee) {
      const sep = Math.hypot(player.pos.x - hunter.root.position.x, player.pos.z - hunter.root.position.z);
      if (!fleeing && hunter.committed && sep < flee.at) fleeing = true;
      else if (fleeing && (sep > flee.until || !hunter.committed)) fleeing = false;
      if (fleeing) {
        yaw = Math.atan2(player.pos.x - hunter.root.position.x, player.pos.z - hunter.root.position.z);
        move = { x: 0, y: 1 }; runFlag = true; advance = false; orderT -= DT;
        ev.fleeFrames++;
      }
    }
    player.aimYaw = yaw;
    player.update(DT, t, { move, run: runFlag, aimYaw: yaw, aimPitch: order.pitch ?? 0 });
    const sw = player.rig.swingHit();
    if (sw) weapons.melee('limbClub', sw.at, sw.dir, t, { ignore: W.playerBody });
    if (player.noise > 0) noise.emit(player.pos, player.noise, 'move');
    noise.update(DT);
    if (hunterOn) hunter.update(DT, t);
    limbField.update(DT, t);
    room.update(DT);
    weapons.update(DT, t);

    run.tick(DT);
    if (run.running) {
      for (const e of exits) if (outThrough(e, player.pos)) { run.escape('p1'); break; }
      if (player.caps?.gait === 'down') run.down('p1');
    }
    if (onFrame) onFrame({ t, player, hunter, run, order });
    if (f % 60 === 0) trail.push({ t: +t.toFixed(1), x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1),
      room: room.spaceAt(player.pos)?.id ?? 'OUT', gait: player.caps.gait, hs: hunter.state,
      aw: +hunter.awareness.toFixed(2) });
    if (run.over) { order = null; done.push({ ...orderInfo(order), }); break; }
    if (advance) { done.push(orderInfo(order)); order = orders[++i]; orderT = 0; }
  }
  return { t: +t.toFixed(2), frames, ev, trail, done, run, phase: run.phase,
    results: run.results(), gait: player.caps.gait,
    limbs: RULES.SOCKETS.filter((s) => player.rig.occupant(s) !== 'empty').length,
    hunterStage: hunter.stage, hunterAbsorbed: hunter.absorbed };
}
function orderInfo(o) { return o ? { kind: o.kind, took: !!o.took, timedOut: !!o.timedOut, opened: o.opened ?? null } : null; }
