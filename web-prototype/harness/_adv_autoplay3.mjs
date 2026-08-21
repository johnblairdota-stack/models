import { chromium } from 'playwright';
import http from 'node:http';
const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// child creates the context AT PARSE TIME (what expedition.js does: initAudio(engine) at module eval)
const CHILD = `<!doctype html><meta charset=utf8><body><script>
window.__r = { atLoad:null, later:null, active:null, resume:'?' };
const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC();
window.__r.atLoad = ctx.state;
const p = ctx.resume(); if (p&&p.catch) { p.then(()=>window.__r.resume='resolved',()=>window.__r.resume='rejected'); }
setTimeout(()=>{ window.__r.later = ctx.state; window.__r.active = navigator.userActivation?.hasBeenActive; }, 2500);
window.__retry = () => { const q = ctx.resume(); return ctx.state; };
<\/script>`;
const PARENT = `<!doctype html><meta charset=utf8><body>
<iframe id=f ALLOW src="http://127.0.0.1:PC/" style="width:400px;height:200px"></iframe>
<button id=b style="width:200px;height:60px">roll</button>`;
const serve = (port, body) => new Promise(res => { const s = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(body);}); s.listen(port,'127.0.0.1',()=>res(s)); });
const PC = 5331;
await serve(PC, CHILD);
await serve(5332, PARENT.replace('PC', PC).replace('ALLOW', 'allow="autoplay"'));
await serve(5333, PARENT.replace('PC', PC).replace('ALLOW', ''));

async function go(label, url, gesture) {
  const br = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=document-user-activation-required'] });
  const pg = await br.newPage();
  await pg.goto(url);
  if (gesture === 'key') await pg.keyboard.press('Space');
  if (gesture === 'click') await pg.click('#b');
  await sleep(3000);
  const fr = pg.frames().find(f => f.url().includes(':' + PC));
  const r = fr ? await fr.evaluate(() => window.__r) : 'no frame';
  console.log(`  ${label.padEnd(58)} ${JSON.stringify(r)}`);
  await br.close();
}
console.log('cross-origin child, context built at parse time, policy=document-user-activation-required');
await go('allow=autoplay · no gesture', 'http://127.0.0.1:5332/', null);
await go('allow=autoplay · parent keydown (Space)', 'http://127.0.0.1:5332/', 'key');
await go('allow=autoplay · parent click', 'http://127.0.0.1:5332/', 'click');
await go('NO allow · no gesture', 'http://127.0.0.1:5333/', null);
console.log('\ntop-level control (same page, no iframe):');
await go('top-level · no gesture', 'http://127.0.0.1:' + PC + '/', null);
process.exit(0);
