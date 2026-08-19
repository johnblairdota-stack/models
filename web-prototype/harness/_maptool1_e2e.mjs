import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewportSize: { width: 1720, height: 1080 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:5181/tools/mapdesigner/', { waitUntil: 'networkidle' });
const box = await p.locator('#cv').boundingBox();
const g = (t,k) => { const L=t.split('\n'); const i=L.findIndex(x=>x.includes(k)); return i<0?'?':L[i+1]; };

console.log('=== EDIT MODE (seed 7, drag the top-left study) ===');
const before = await p.locator('#metrics').innerText();
await p.click('#modeBtn');                    // enter edit via the button, no focus games
console.log('mode:', await p.locator('#modeBtn').innerText());
await p.mouse.move(box.x + 220, box.y + 160); await p.mouse.down();
await p.mouse.move(box.x + 250, box.y + 130, { steps: 10 });
await p.mouse.up(); await p.waitForTimeout(400);
const after = await p.locator('#metrics').innerText();
for (const k of ['envelope','rooms / corridors','shared wall','of which diggable','diggable / internal','dig panels'])
  console.log(`  ${k.padEnd(22)} ${g(before,k).padStart(12)}  ->  ${g(after,k)}`);
console.log('  edit warn:', await p.locator('#editWarn').innerText());
console.log('  flat now :', g(await p.locator('#flatGrid').innerText(), 'depth = min'));
await p.evaluate(() => document.querySelectorAll('details')[1].open = true);
await p.waitForTimeout(150);
const v = await p.locator('#verify').innerText();
console.log('  verify   :', v.split('\n').filter(l=>l.includes('PASS')||l.includes('FAIL')).join(' | '));
await p.screenshot({ path: 'tmp_critic/mapdesigner-edit.png' });

console.log('\n=== ROTATE + EXPORT ===');
await p.click('#rotBtn'); await p.waitForTimeout(300);
console.log('  after rotate, shared wall =', g(await p.locator('#metrics').innerText(),'shared wall'));
const json = await p.evaluate(() => { document.getElementById('expShow').click(); return document.getElementById('jsonOut').textContent; });
const j = JSON.parse(json);
console.log('  export keys:', Object.keys(j).join(' '));
console.log('  spaces:', j.spaces.length, '· edges:', j.edges.length, '· boundaries:', j.boundaries.length, '· handEdited:', j.handEdited);
console.log('  difficulty.score =', JSON.stringify(j.difficulty.score), '· model =', j.difficulty.model);
console.log(errs.length ? '\nERRORS:\n'+errs.join('\n') : '\nno console errors');
await b.close();
