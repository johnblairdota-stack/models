import { run } from './_mr2_sim.mjs';
for (const w of ['ballroom','service','study_e']) {
  const r = run({ wing: w, seed: 7, trace: 30 });
  console.log(`\n### ${w}  ->  ${r.outcome} at ${r.t}s`);
  console.log(r.rows.map(x=>`${x.t}s (${x.x},${x.z}) ${String(x.room).padEnd(8)} d=${x.d} det=${x.det} ${x.hs}/${x.aw}`).join('\n'));
}
