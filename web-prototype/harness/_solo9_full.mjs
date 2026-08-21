/**
 * _solo9_full — THE WHOLE SOLO RUN, TWO POLICIES, TEN SEEDS.
 *   naive     hammer the door in front of you whatever the Hunter is doing
 *   cautious  break off and sprint when it COMMITS, come back when it is clear
 * The route is the perimeter in `EXIT_SITES` order, 5 blows per door, then out.
 */
import { makeWorld, RULES } from './_solo1_boot.mjs';
import { drive } from './_solo2_play.mjs';

const SEEDS = (process.env.SEEDS ?? 's0,s1,s2,s3,s4,s5,s6,s7,s8,s9').split(',');
for (const [name, flee] of [['naive', null], ['cautious', { at: 11, until: 17 }]]) {
  console.log(`\n=== ${name} ===`);
  console.log('seed  live-exit               lock      t_out   phase     doors-probed  kills limbs gait   hstage swings flee_s');
  const outs = [], kills = [];
  for (const seed of SEEDS) {
    const W = await makeWorld({ seed });
    const at = W.sledgeAt;
    const orders = [{ kind: 'take', at: { x: at.x, z: at.z }, within: 1.0, max: 60, run: true }];
    // two laps of the perimeter, so a door skipped while fleeing gets a second visit
    for (let lap = 0; lap < 2; lap++) for (const e of W.exits) {
      if (e.site.a === 'chapel') continue;                 // behind a breachable panel, not on the lap
      const p = e.panel, n = p.normal, s = e.outSign;
      orders.push({ kind: 'chew', panel: p,
        stand: { x: p.root.position.x - n.x * s * 1.05, z: p.root.position.z - n.z * s * 1.05 },
        face: { x: p.root.position.x + n.x * s * 2.0, z: p.root.position.z + n.z * s * 2.0 },
        max: 45, run: true, probe: 5 });
    }
    const live = W.exits.find((e) => e.site.id === W.run.exitId);
    if (live && live.site.a !== 'chapel') {                 // then finish the one that yielded
      const p = live.panel, n = p.normal, s = live.outSign;
      orders.push({ kind: 'chew', panel: p,
        stand: { x: p.root.position.x - n.x * s * 1.05, z: p.root.position.z - n.z * s * 1.05 },
        face: { x: p.root.position.x + n.x * s * 2.0, z: p.root.position.z + n.z * s * 2.0 }, max: 90, run: true });
      orders.push({ kind: 'walkout', at: { x: p.root.position.x + n.x * s * 3.0, z: p.root.position.z + n.z * s * 3.0 }, max: 25 });
    }
    const r = drive(W, orders, { seconds: 900, flee });
    const out = r.results.escaped[0];
    if (out) outs.push(out.seconds);
    kills.push(r.ev.kills);
    console.log(seed.padEnd(5), W.run.exitId.padEnd(23), W.run.lock.id.padEnd(9),
      (out ? out.seconds.toFixed(1) : '   -').padStart(7), r.phase.padEnd(9),
      String(r.done.filter((d) => d && d.kind === 'chew').length).padStart(12),
      String(r.ev.kills).padStart(6), String(r.limbs).padStart(5), r.gait.padEnd(6),
      ('s' + r.hunterStage).padStart(6), String(r.ev.swings).padStart(6),
      (r.ev.fleeFrames / 60).toFixed(0).padStart(6));
  }
  outs.sort((a, b) => a - b);
  console.log(`  escaped ${outs.length}/${SEEDS.length} · median ${outs.length ? outs[outs.length >> 1].toFixed(1) : '-'}s`
    + ` · range ${outs.length ? outs[0].toFixed(1) + '-' + outs[outs.length - 1].toFixed(1) : '-'}s`
    + ` · limbs taken total ${kills.reduce((a, b) => a + b, 0)}`);
}
