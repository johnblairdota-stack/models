import { readFileSync, writeFileSync } from 'fs';
const p = 'harness/_overnight_vote_loop4_pw_cast_ux.mjs';
let c = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
// Split merged md rows into two array entries
c = c.replace(
  /`\| 5\. Empty still no invent \(spot\) \| \$\{results\.emptyNoInvent\.pass \? 'PASS' : 'FAIL'\} \| \$\{results\.emptyNoInvent\.why \|\| ''\} \|\n\| 6\. Arm when all-sent \(#49\) \| \$\{results\.armAllSent\.pass \? 'PASS' : 'FAIL'\} \| \$\{results\.armAllSent\.why \|\| ''\} \|`,/,
  "`| 5. Empty still no invent (spot) | ${results.emptyNoInvent.pass ? 'PASS' : 'FAIL'} | ${results.emptyNoInvent.why || ''} |`,\n    `| 6. Arm when all-sent (#49) | ${results.armAllSent.pass ? 'PASS' : 'FAIL'} | ${results.armAllSent.why || ''} |`,"
);
if (!c.includes('d-arm-all-sent.png')) {
  c = c.replace(
    '- `loop4-pw-shots/c-empty-force.png`',
    '- `loop4-pw-shots/c-empty-force.png`\n- `loop4-pw-shots/d-arm-all-sent.png`'
  );
}
// Fix mojibake robot line label
c = c.replace(/\| 3\. Robot N[^\|]*\|/, '| 3. Robot N names |');
writeFileSync(p, c);
console.log('fixed');
