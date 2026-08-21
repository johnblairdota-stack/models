/**
 * _solo4_lock — WHAT DOES THE LOCK COST? `run.js` LOCKS says the three locks are the cheapest
 * variety in the design and `escape.md` §1 calls the beam stage "the design's best beat".
 * The healths live in EXIT_DEFS. This asks what each lock actually costs the two tools that
 * can reach it, in blows and in seconds.
 */
import { makeWorld, THREE, RULES, FINAL_STAGE } from './_solo1_boot.mjs';
const { WEAPON_DAMAGE, WEAPON_COOLDOWN } = RULES;
const CN = (await import(new URL('../src/game/connectors.js', import.meta.url).href));
const WL = (await import(new URL('../src/destruction/wall.js', import.meta.url).href));
WL.STAGE_DEFS ?? 0;
const SLEDGE_POWER = Number((await import('node:fs')).readFileSync(
  new URL('../src/game/player.js', import.meta.url), 'utf8').match(/const SLEDGE_POWER = ([\d.]+)/)?.[1] ?? 1);

console.log('SLEDGE_POWER =', SLEDGE_POWER, '· sledge cooldown', WEAPON_COOLDOWN.sledge, 's · nailgun', WEAPON_COOLDOWN.nailgun, 's');
console.log('\nEXIT_DEFS:', CN.EXIT_DEFS.map((d, i) => `${i}:${d.health}${d.blocksMove === false ? '(open)' : ''}`).join('  '));
console.log('STAGE_DEFS:', WL.STAGE_DEFS.map((d, i) => `${i}:${d.health}`).join('  '));
console.log('CHAINED_DEFS:', CN.CHAINED_DEFS.map((d, i) => `${i}:${d.health}/${d.damageable}`).join('  '));

const W = await makeWorld({ seed: 'rrr-test-1' });
const panel = W.exits[0].panel;

function cost(defs, startStage, mode) {
  const st = panel.state;
  st.defs = defs; st.stage = startStage; st.stageHealth = defs[startStage].health;
  panel._recomputeBox(); panel._apply();
  let blows = 0, hp = 0;
  const pt = panel.root.position.clone();
  while (panel.blocksMovement() && blows < 100000) {
    blows++;
    if (mode === 'sledge') { const r = panel.applyHit(pt, SLEDGE_POWER * 1); if (r?.blocked) return { blows: Infinity, hp: Infinity }; }
    else { const r = panel.damage(WEAPON_DAMAGE[mode], { point: [pt.x, pt.y, pt.z] }); if (r == null || r.refused) return { blows: Infinity, hp: Infinity }; }
    hp += mode === 'sledge' ? 0 : WEAPON_DAMAGE[mode];
  }
  return { blows, hp };
}
const LOCKS = [['boarded', 0], ['plaster', 1], ['beams', 3]];
console.log('\nlock      startStage  total EXIT_DEFS health remaining   SLEDGE blows / s   NAILGUN blows / s   OIL blows / s');
for (const [id, s0] of LOCKS) {
  const remaining = CN.EXIT_DEFS.slice(s0).reduce((a, d) => a + (d.health || 0), 0);
  const sl = cost(CN.EXIT_DEFS, s0, 'sledge');
  const ng = cost(CN.EXIT_DEFS, s0, 'nailgun');
  const oi = cost(CN.EXIT_DEFS, s0, 'oil');
  const f = (c, cd) => `${String(c.blows).padStart(6)} / ${(c.blows * cd).toFixed(1).padStart(6)}s`;
  console.log(id.padEnd(9), String(s0).padStart(6), String(remaining).padStart(24),
    '   ', f(sl, WEAPON_COOLDOWN.sledge), '  ', f(ng, WEAPON_COOLDOWN.nailgun), '  ', f(oi, WEAPON_COOLDOWN.oil));
}
console.log('\nchained (damageable:false), same three tools:');
const c1 = cost(CN.CHAINED_DEFS, 0, 'sledge'), c2 = cost(CN.CHAINED_DEFS, 0, 'nailgun');
console.log('  sledge', c1.blows, '· nailgun', c2.blows, ' (Infinity = refused, which is correct)');
console.log('\nan ordinary BREACHABLE interior panel (STAGE_DEFS), same tools:');
console.log('  sledge', cost(WL.STAGE_DEFS, 0, 'sledge').blows, 'blows /', (cost(WL.STAGE_DEFS,0,'sledge').blows*WEAPON_COOLDOWN.sledge).toFixed(1), 's · nailgun',
  cost(WL.STAGE_DEFS, 0, 'nailgun').blows, 'blows /', (cost(WL.STAGE_DEFS,0,'nailgun').blows*WEAPON_COOLDOWN.nailgun).toFixed(1), 's');
