import fs from 'fs';
const files = [
  'harness/_overnight_bake_wait.mjs',
  'harness/_overnight_loop_next.mjs',
  'harness/_overnight_post19.mjs',
  'harness/_overnight_post20.mjs',
  'harness/_overnight_post22.mjs',
  'harness/_overnight_post22b.mjs',
  'harness/_overnight_post23.mjs',
  'harness/_overnight_recap19.mjs',
];
const re = /const CODE = '[a-z]' \+ Math\.random\(\)\.toString\(36\)\.slice\(2, 5\);/;
const rep = "const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';\nconst CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');";
for (const f of files) {
  if (!fs.existsSync(f)) { console.log('MISS', f); continue; }
  let c = fs.readFileSync(f, 'utf8');
  if (!re.test(c)) { console.log('SKIP', f); continue; }
  fs.writeFileSync(f, c.replace(re, rep));
  console.log('FIXED', f);
}
