import { readFileSync, writeFileSync } from 'fs';
const path = 'src/views/party-phone.js';
let p = readFileSync(path, 'utf8');
// Normalize the one accidental LF inside the patched comment block
const bad = 'rather than\n       * inventing TIME';
const good = 'rather than\r\n       * inventing TIME';
if (p.includes(bad)) {
  p = p.replace(bad, good);
  writeFileSync(path, p);
  console.log('normalized CRLF in comment');
} else {
  console.log('no mixed LF (ok)');
}
console.log('invent gone', !p.includes("c.runEnd || 'TIME'"));
console.log('omit paint', p.includes('if (c.runEnd) body +='));
console.log('same honesty', p.includes('same honesty as TV'));