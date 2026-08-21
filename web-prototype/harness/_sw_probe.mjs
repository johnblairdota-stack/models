// scratch: find (a) controls whose subject is a literal on the same line,
//          (b) gate-side literal arrays/objects that duplicate an export of an imported module.
import { readdirSync, readFileSync } from 'node:fs';
const ROOT = new URL('../', import.meta.url);
const gates = readdirSync(new URL('harness/', ROOT)).filter((f) => f.endsWith('.mjs') && !f.startsWith('_'));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, (m, p) => p);

// (a) predicate applied to a literal
for (const g of gates) {
  const raw = readFileSync(new URL('harness/' + g, ROOT), 'utf8');
  strip(raw).split('\n').forEach((line, i) => {
    const hits = [
      /\.test\(\s*(['"`])/.test(line),
      /\.(includes|match|indexOf|startsWith|endsWith|search)\(\s*\/[^/]/.test(line) && /(['"`])[^'"`]{12,}\1\s*\./.test(line),
      /(['"`])[^'"`]{10,}\1\s*\.(match|includes|replace|split)\(/.test(line),
    ];
    if (hits.some(Boolean)) console.log(`A ${g}:${i + 1}  ${line.trim().slice(0, 150)}`);
  });
}
