import { readFileSync } from 'node:fs';
import { camerasNeeded, WIN_TARGETS } from '../src/party/win.js';
const src = readFileSync(new URL('../src/views/expedition.js', import.meta.url), 'utf8');
const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
console.log('W10c predicate  /camerasNeeded/ :', /camerasNeeded/.test(body));
console.log('W10c predicate !/needed:\\s*\\d/ :', !/needed:\s*\d/.test(body));
console.log('  => W10c passes:', /camerasNeeded/.test(body) && !/needed:\s*\d/.test(body));
console.log('\nthe two lines W10c walked past:');
for (const l of body.split('\n')) if (/camerasNeeded|camerasUnlocked = /.test(l)) console.log('   ' + l.trim());
console.log('\n  · the denominator is `camerasNeeded(8)` — the player count is a literal, at every table size');
console.log('  · the numerator is seeded at Math.max(1, ...) — the exact +1 that L20/W10 control call');
console.log('    "the shipped pair read the season is made while the show kept shooting"');
console.log('\n  session.js starts the same counter at 0:');
const ss = readFileSync(new URL('../src/party/session.js', import.meta.url), 'utf8');
for (const l of ss.split('\n')) if (/cameras: \{ unlocked/.test(l)) console.log('   ' + l.trim());
console.log('\n  so with a mansion attached the television overlay reads', 1, 'of', camerasNeeded(8),
  'while the show\'s own scoreboard reads 0 of', WIN_TARGETS[8].cameraTarget);
