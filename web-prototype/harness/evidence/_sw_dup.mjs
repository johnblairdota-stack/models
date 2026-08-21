import { readdirSync, readFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, (m, p) => p);
const gates = readdirSync(new URL('harness/', ROOT)).filter((f) => f.endsWith('.mjs') && !f.startsWith('_'));
for (const g of gates) {
  const body = strip(readFileSync(new URL('harness/' + g, ROOT), 'utf8'));
  for (const m of body.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(\[[\s\S]{0,600}?\]|\{[\s\S]{0,600}?\})\s*;/g)) {
    const lit = m[2];
    const items = [...lit.matchAll(/'([^'\n]{2,40})'/g)].map((x) => x[1]);
    if (items.length < 3) continue;
    if (/=>|function|readFileSync|import\(|\.map\(|\.filter\(|Object\./.test(lit)) continue;
    const line = body.slice(0, m.index).split('\n').length;
    console.log(`${g}:${line}  ${m[1]} = [${items.length}] ${items.slice(0, 14).join(' ')}`);
  }
}
