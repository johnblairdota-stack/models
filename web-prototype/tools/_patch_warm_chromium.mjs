import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/_overnight_warmwalk.mjs';
let s = readFileSync(p, 'utf8');
// Use bundled chromium, not system Chrome (network service crash)
s = s.replace(
  /browser = await chromium\.launch\(\{\s*channel: 'chrome',\s*headless: true\s*\}\);/,
  "browser = await chromium.launch({ headless: true });"
);
s = s.replace(/note\('browser', 'chrome headless verify'\);/, "note('browser', 'bundled chromium headless');");
writeFileSync(p, s);
console.log('bundled', !/channel: 'chrome'/.test(s.match(/chromium\.launch\([\s\S]*?\}\);/)?.[0] || ''));
