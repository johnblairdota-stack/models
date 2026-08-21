/** _solo11_closure — how much of src/ does each mode's view actually pull in? Static closure
 *  over `import ... from './x.js'` and `await import('...')`, from each entry. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function closure(entry) {
  const seen = new Set(); const stack = [path.resolve(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    const s = readFileSync(f, 'utf8');
    const re = /(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g;
    let m; while ((m = re.exec(s))) {
      const p = path.resolve(path.dirname(f), m[1]);
      if (p.endsWith('.js')) stack.push(p);
    }
  }
  return seen;
}
const lines = (f) => readFileSync(f, 'utf8').split('\n').length;
const solo = closure('src/views/game.js');
const party = closure('src/views/expedition.js');
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const sum = (set) => [...set].reduce((a, f) => a + lines(f), 0);
console.log(`views/game.js       closure ${solo.size} files, ${sum(solo)} lines`);
console.log(`views/expedition.js closure ${party.size} files, ${sum(party)} lines`);
const onlySolo = [...solo].filter((f) => !party.has(f)).sort((a, b) => lines(b) - lines(a));
const onlyParty = [...party].filter((f) => !solo.has(f)).sort((a, b) => lines(b) - lines(a));
console.log(`\nreachable ONLY from views/game.js — ${onlySolo.length} files, ${onlySolo.reduce((a, f) => a + lines(f), 0)} lines:`);
for (const f of onlySolo) console.log(`  ${String(lines(f)).padStart(5)}  ${rel(f)}`);
console.log(`\nreachable ONLY from views/expedition.js — ${onlyParty.length} files, ${onlyParty.reduce((a, f) => a + lines(f), 0)} lines:`);
for (const f of onlyParty) console.log(`  ${String(lines(f)).padStart(5)}  ${rel(f)}`);
const shared = [...solo].filter((f) => party.has(f));
console.log(`\nSHARED by both — ${shared.length} files, ${shared.reduce((a, f) => a + lines(f), 0)} lines (the blast radius of any engine edit)`);
console.log('  the ten biggest:');
for (const f of shared.sort((a, b) => lines(b) - lines(a)).slice(0, 12)) console.log(`  ${String(lines(f)).padStart(5)}  ${rel(f)}`);
console.log(`\n⚠️ views/expedition.js imports makeLightRig from views/game.js:`,
  /from '\.\/game\.js'/.test(readFileSync(path.resolve(ROOT, 'src/views/expedition.js'), 'utf8')));
