import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
function walk(d, acc=[]) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|mjs|css|html)$/.test(n)) acc.push(p);
  }
  return acc;
}
const hits = [];
for (const p of [...walk('src'), ...walk('public').catch?.() || []]) {
  try {
    const s = readFileSync(p, 'utf8');
    if (/locked-out|self-pick/.test(s)) {
      const lines = s.split(/\n/);
      lines.forEach((l,i) => { if (/locked-out|self-pick|dashed/.test(l)) hits.push(p+':'+(i+1)+':'+l.trim().slice(0,140)); });
    }
  } catch {}
}
console.log(hits.join('\n'));
