// gen-light-42: what lights does a GENERATED ballroom actually come out with?
// Reading the browser's scene tells you what arrived; this tells you what was sent, which is
// the other half of the wire. `attachLights` runs inside `generatedTables`, and `dressGenerated`
// sets `row.order` AFTERWARDS — so a condition in attachLights that tests `order` can never
// fire, and the only field it can test is whatever the generator itself set.
import { generatedTables } from '../src/world/genplan.js';
const seed = process.argv[2] ?? '4';
const gen = generatedTables(String(seed), {});
const rows = gen.spaces.filter((r) => /ballroom/i.test(String(r.id)) || r.roomType === 'ballroom' || r.order === 'ballroom');
console.log(`seed ${seed}: ${gen.spaces.length} spaces, ${rows.length} ballroom-ish`);
for (const r of rows) {
  console.log(`  id=${r.id}  roomType=${r.roomType}  order=${r.order}  ` +
    `${(r.x1 - r.x0).toFixed(1)} x ${(r.z1 - r.z0).toFixed(1)} x ${r.storey}`);
  const L = r.lights;
  if (!L) { console.log('    NO LIGHTS'); continue; }
  console.log(`    key   ${L.key?.intensity}  #${(L.key?.color ?? 0).toString(16)}  dist ${L.key?.dist}`);
  for (const w of L.warm ?? []) console.log(`    warm  ${w.intensity}  #${(w.color ?? 0).toString(16)}  dist ${w.dist}`);
  console.log(`    cool  ${L.cool?.intensity}  #${(L.cool?.color ?? 0).toString(16)}  dist ${L.cool?.dist}`);
}
// and every room type present, so "is there a ballroom at all in this seed" is answerable
const types = {};
for (const r of gen.spaces) types[r.roomType ?? '(none)'] = (types[r.roomType ?? '(none)'] || 0) + 1;
console.log('  roomTypes:', JSON.stringify(types));
