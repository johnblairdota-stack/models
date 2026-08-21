/**
 * _solo10_ramp — the two-rate awareness ramp, re-measured from `rules.js`'s own function.
 * `HUNTER_SENSE`'s comment gives the SINGLE-rate curve it replaced as 0.58 s ALERT->PURSUE at
 * 4 m and 1.58 s at 24 m. This integrates the SHIPPED `hunterSightGain` at a range sweep and
 * prints what the player actually gets.
 */
import { RULES } from './_solo1_boot.mjs';
const S = RULES.HUNTER_SENSE, gain = RULES.hunterSightGain;
const DT = 1 / 240;
function ramp(d) {
  let a = 0, tAlert = null, tCommit = null, t = 0;
  for (let i = 0; i < 240 * 60; i++) {
    t = i * DT;
    if (tAlert == null && a >= S.alertAt) tAlert = t;
    if (a >= S.commitAt) { tCommit = t; break; }
    a += gain(d, a) * DT;
  }
  return { d, tAlert, tStalk: null, tCommit, gap: tCommit - tAlert };
}
console.log('two-rate ramp, shipped `hunterSightGain`, target in continuous sight:');
console.log('   d(m)   t ALERT (the tell)   t PURSUE (committed)   ALERT->PURSUE (the warning)');
for (const d of [1, 3, 4, 8, 12, 16, 20, 24, 26]) {
  const r = ramp(d);
  console.log(`  ${String(d).padStart(4)}   ${r.tAlert.toFixed(2).padStart(12)} s   ${r.tCommit.toFixed(2).padStart(18)} s   ${r.gap.toFixed(2).padStart(20)} s`);
}
const a4 = ramp(4), a24 = ramp(24);
console.log(`\n  the comment's own single-rate numbers: 4 m gap 0.58 s · 24 m gap 1.58 s (2.7x over 6x the distance)`);
console.log(`  shipped two-rate:                      4 m gap ${a4.gap.toFixed(2)} s · 24 m gap ${a24.gap.toFixed(2)} s (${(a24.gap / a4.gap).toFixed(1)}x)`);
console.log(`  and the TELL is unmoved by range: t ALERT ${ramp(4).tAlert.toFixed(2)} s at 4 m vs ${ramp(24).tAlert.toFixed(2)} s at 24 m`);
console.log(`  sound alone: soundCeiling ${S.soundCeiling} < commitAt ${S.commitAt} -> noise can never commit it. delta ${(S.commitAt - S.soundCeiling).toFixed(2)}`);
