import { readFileSync } from 'fs';
const p = readFileSync('src/views/party-phone.js', 'utf8');
console.log('len', p.length, 'bom', p.charCodeAt(0));
let idx = 0;
while ((idx = p.indexOf('TIME', idx)) !== -1) {
  console.log(idx, JSON.stringify(p.slice(Math.max(0, idx - 50), idx + 50)));
  idx += 4;
}
console.log('--- invent variants ---');
for (const s of [
  "const end = c.runEnd || 'TIME';",
  'const end = c.runEnd || "TIME";',
  "c.runEnd || 'TIME'",
]) {
  console.log(JSON.stringify(s), p.includes(s));
}