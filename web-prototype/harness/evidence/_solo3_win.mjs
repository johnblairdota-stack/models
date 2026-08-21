/** _solo3_win — can a solo run be WON? Walk to the hammer, walk to the live exit, chew, leave. */
import { makeWorld, drive } from './_solo2_play.mjs';

const SEEDS = process.argv[2] ? [process.argv[2]] : ['rrr-test-1','s1','s2','s3','s4','s5','s6','s7'];
console.log('seed        exit                   lock     hp   sledge  open@   out@  phase    hunter  kills stg  swings panels');
for (const seed of SEEDS) {
  const W = await makeWorld({ seed });
  const live = W.exits.find((e) => e.site.id === W.run.exitId);
  const p = live.panel, n = p.normal, s = live.outSign;
  const stand = { x: p.root.position.x - n.x * s * 1.05, z: p.root.position.z - n.z * s * 1.05 };
  const face  = { x: p.root.position.x + n.x * s * 2.0,  z: p.root.position.z + n.z * s * 2.0 };
  const out   = { x: p.root.position.x + n.x * s * 3.0,  z: p.root.position.z + n.z * s * 3.0 };
  const hp0 = p.state.stageHealth;
  const at = W.sledgeAt;
  const orders = [
    { kind: 'take', at: { x: at.x, z: at.z }, within: 1.0, max: 60, run: true },
    { kind: 'chew', panel: p, stand, face, max: 300, run: true },
    { kind: 'walkout', at: out, max: 25 },
  ];
  const r = drive(W, orders, { seconds: 420 });
  const took = r.done[0]?.took, opened = r.done[1]?.opened;
  console.log(
    seed.padEnd(11),
    W.run.exitId.padEnd(22),
    W.run.lock.id.padEnd(8),
    String(hp0).padStart(4),
    (took ? 'yes' : 'NO ').padStart(6),
    (opened != null ? opened.toFixed(1) : '  -').padStart(6),
    (r.results.escaped[0] ? r.results.escaped[0].seconds.toFixed(1) : '  -').padStart(6),
    r.phase.padEnd(9),
    ('s' + r.hunterStage + '/' + r.hunterAbsorbed).padEnd(7),
    String(r.ev.kills).padStart(4),
    String(r.ev.stage.length).padStart(3),
    String(r.ev.swings).padStart(6),
    String(r.ev.panelTouched.size).padStart(4), [...r.ev.panelTouched].join(','));
}
