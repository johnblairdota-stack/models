import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const seen = new Set();
function walk(f) {
  if (seen.has(f)) return; seen.add(f);
  let src; try { src = readFileSync(f, 'utf8'); } catch { return; }
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
    const p = m[1];
    if (!p.startsWith('.')) continue;
    walk(resolve(dirname(f), p));
  }
}
for (const root of process.argv.slice(2)) walk(resolve(root));
console.log([...seen].map((p) => p.replace(process.cwd() + '/', '')).sort().join('\n'));
