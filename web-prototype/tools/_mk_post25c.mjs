import { readFileSync, writeFileSync } from 'node:fs';
let s = readFileSync('harness/_overnight_post25.mjs', 'utf8');
s = s.replace('headless: false', 'headless: true');
s = s.replaceAll('overnight-post25', 'overnight-post25c');
s = s.replace('for (let i = 0; i < 14; i++)', 'for (let i = 0; i < 10; i++)');
writeFileSync('harness/_overnight_post25c.mjs', s);
console.log('wrote', s.length);
