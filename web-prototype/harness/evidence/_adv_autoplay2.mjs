// throwaway: does a PARENT gesture unblock a cross-origin child's AudioContext?
import { chromium } from 'playwright';
import http from 'node:http';
const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHILD = `<!doctype html><meta charset=utf8><body>
<script>
let ctx = null;
addEventListener('message', async (e) => {
  if (e.data !== 'try') return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!ctx) ctx = new AC();
  let settled = false;
  ctx.resume().then(()=>settled='resolved',(x)=>settled='rejected');
  await new Promise(r=>setTimeout(r,600));
  parent.postMessage({ state: ctx.state, resume: settled || 'PENDING',
    childHasBeenActive: navigator.userActivation ? navigator.userActivation.hasBeenActive : 'n/a' }, '*');
});
<\/script>`;
const PARENT = `<!doctype html><meta charset=utf8><body>
<button id=b style="width:300px;height:120px">SPACE / roll</button>
<iframe id=f allow="autoplay" src="http://127.0.0.1:PC/" style="width:300px;height:120px"></iframe>
<script>
window.__r = [];
addEventListener('message', e => { if (e.data && e.data.state) window.__r.push(e.data); });
window.ask = () => document.getElementById('f').contentWindow.postMessage('try','*');
<\/script>`;
const serve = (port, body) => new Promise(res => { const s = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(body);}); s.listen(port,'127.0.0.1',()=>res(s)); });
const PC=5321, PP=5322;
const a = await serve(PC, CHILD), b = await serve(PP, PARENT.replace('PC', PC));
for (const policy of [null, 'document-user-activation-required']) {
  const args = policy ? [`--autoplay-policy=${policy}`] : [];
  const br = await chromium.launch({ executablePath: CHROME, args });
  const p = await br.newPage();
  await p.goto(`http://127.0.0.1:${PP}/`);
  await p.evaluate(() => window.ask());
  await p.waitForTimeout(900);
  const before = await p.evaluate(() => window.__r.slice(-1)[0]);
  await p.click('#b');                       // a real gesture on the PARENT, cross-origin to child
  await p.evaluate(() => window.ask());
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => window.__r.slice(-1)[0]);
  const parentActive = await p.evaluate(() => navigator.userActivation.hasBeenActive);
  console.log(`policy=${policy ?? '(playwright default)'}`);
  console.log(`   before parent gesture: ${JSON.stringify(before)}`);
  console.log(`   after  parent gesture: ${JSON.stringify(after)}  (parent hasBeenActive=${parentActive})`);
  await br.close();
}
a.close(); b.close();
