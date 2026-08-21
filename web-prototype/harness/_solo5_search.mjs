/**
 * _solo5_search — THE ACTUAL SOLO RUN. The player does not know which of the 14 sites is live
 * (`?tells=blind` is the default and `connectors.js` `connectorDressing` derives every cue from
 * a seeded hash of the connector id, never from its state). So the run is: take the hammer,
 * walk the perimeter, hit each door until one yields, walk out.
 *
 * Probe budget per door = `PROBE` blows. Four is exactly one stage on the hammer, i.e. the
 * cheapest honest test: a live door visibly crosses a stage, a chained one cannot.
 */
import { makeWorld, THREE, RULES } from './_solo1_boot.mjs';
import { drive } from './_solo2_play.mjs';

const PROBE = +(process.env.PROBE ?? 5);
const SEEDS = (process.env.SEEDS ?? 's0,s1,s2,s3,s4,s5,s6,s7,s8,s9').split(',');

console.log(`blind perimeter search · ${PROBE} blows per door · hunter ON`);
console.log('seed  live-exit              lock     doors  order-hit  t_out   phase     kills  limbs gait   hstage  bang  commit  aware%');
const rows = [];
for (const seed of SEEDS) {
  const W = await makeWorld({ seed });
  const live = W.run.exitId;
  // walk the sites in table order — the order a player reading the perimeter would meet them
  const reachable = W.exits.filter((e) => {
    const home = W.room.spaces.find((s) => s.id === e.site.a);
    return home && W.room.pathPortals(W.room.spawn.player[0], { x: home.cx, y: 0, z: home.cz },
      0.6, RULES.PASS_H.robot).length >= 0 && home.id !== 'chapel';
  });
  const at = W.sledgeAt;
  const orders = [{ kind: 'take', at: { x: at.x, z: at.z }, within: 1.0, max: 60, run: true }];
  for (const e of reachable) {
    const p = e.panel, n = p.normal, s = e.outSign;
    orders.push({ kind: 'chew', panel: p,
      stand: { x: p.root.position.x - n.x * s * 1.05, z: p.root.position.z - n.z * s * 1.05 },
      face: { x: p.root.position.x + n.x * s * 2.0, z: p.root.position.z + n.z * s * 2.0 },
      max: 40, run: true, probe: PROBE, siteId: e.site.id });
  }
  let awareFrames = 0, frames = 0;
  const r = drive(W, orders, { seconds: 900,
    onFrame: ({ hunter }) => { frames++; if (hunter.awareness >= RULES.HUNTER_SENSE.alertAt) awareFrames++; } });
  // which order index actually opened?
  const hitIx = r.done.findIndex((d) => d && d.opened != null);
  const liveEx = W.exits.find((e) => e.site.id === live);
  const out = r.results.escaped[0];
  rows.push({ seed, t: out ? out.seconds : null, kills: r.ev.kills });
  console.log(seed.padEnd(5), live.padEnd(22), W.run.lock.id.padEnd(8),
    String(reachable.length).padStart(5),
    String(hitIx).padStart(9), (out ? out.seconds.toFixed(1) : '   -').padStart(7),
    r.phase.padEnd(9), String(r.ev.kills).padStart(6), String(r.limbs).padStart(6),
    r.gait.padEnd(6), ('s' + r.hunterStage).padStart(6), String(r.ev.bang).padStart(5),
    String(r.ev.commit).padStart(7), (100 * awareFrames / Math.max(1, frames)).toFixed(0).padStart(6));
}
const outs = rows.filter((x) => x.t != null).map((x) => x.t).sort((a, b) => a - b);
console.log(`\nescaped ${outs.length}/${rows.length} · t_out median ${outs.length ? outs[outs.length >> 1].toFixed(1) : '-'}s · range ${outs.length ? outs[0].toFixed(1) + '-' + outs[outs.length - 1].toFixed(1) : '-'}s · total kills ${rows.reduce((a, x) => a + x.kills, 0)}`);
