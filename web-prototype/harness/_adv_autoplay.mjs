// throwaway: does audio autoplay actually work through a cross-origin iframe the way show-tv claims?
import { chromium } from 'playwright';
import http from 'node:http';

const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const CHILD = `<!doctype html><meta charset=utf8><body style="background:#111">
<script>
(async () => {
  const out = { created:null, afterResume:null, err:null, hasGesture:null };
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    out.created = ctx.state;
    let settled = false;
    ctx.resume().then(()=>{settled='resolved';}, (e)=>{settled='rejected:'+e});
    await new Promise(r => setTimeout(r, 800));
    out.resumePromise = settled === false ? 'STILL PENDING' : settled;
    out.afterResume = ctx.state;
    // is a real oscillator audible? currentTime advancing is the honest signal
    const t0 = ctx.currentTime;
    await new Promise(r => setTimeout(r, 250));
    out.advanced = +(ctx.currentTime - t0).toFixed(3);
  } catch (e) { out.err = String(e); }
  out.hasGesture = navigator.userActivation ? navigator.userActivation.hasBeenActive : 'n/a';
  parent.postMessage({ t:'audio', out }, '*');
  document.title = JSON.stringify(out);
})();
<\/script>`;

const parentPage = (allow) => `<!doctype html><meta charset=utf8><body style="background:#000">
<button id=b style="width:200px;height:80px">roll</button>
<iframe id=f ${allow ? 'allow="autoplay"' : ''} src="http://127.0.0.1:PORT_CHILD/" style="width:400px;height:200px"></iframe>
<script>
window.__res = null;
addEventListener('message', (e) => { if (e.data && e.data.t === 'audio') window.__res = e.data.out; });
<\/script>`;

function serve(port, body) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(body); });
    s.listen(port, '127.0.0.1', () => res(s));
  });
}

const CHILD_PORT = 5311, PARENT_PORT = 5312, PARENT_PORT2 = 5313;
const sChild = await serve(CHILD_PORT, CHILD);
const sA = await serve(PARENT_PORT, parentPage(true).replace('PORT_CHILD', CHILD_PORT));
const sB = await serve(PARENT_PORT2, parentPage(false).replace('PORT_CHILD', CHILD_PORT));

async function runTop(label, url, { policy }) {
  const browser = await chromium.launch({ executablePath: CHROME, args: [`--autoplay-policy=${policy}`] });
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForTimeout(2500);
  console.log(`  ${label.padEnd(52)} ${await page.title()}`);
  await browser.close();
}

async function run(label, url, { gesture, policy }) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [`--autoplay-policy=${policy}`],
  });
  const page = await browser.newPage();
  await page.goto(url);
  if (gesture) { await page.click('#b'); await page.reload(); await page.click('#b'); }
  await page.waitForTimeout(2500);
  const res = await page.evaluate(() => window.__res);
  const t = await page.frames()[1]?.title().catch(()=>null);
  console.log(`  ${label.padEnd(52)} postMessage=${JSON.stringify(res)} frameTitle=${t}`);
  await browser.close();
}

for (const policy of ['document-user-activation-required', 'no-user-gesture-required']) {
  console.log(`\n=== --autoplay-policy=${policy} ===`);
  await run('cross-origin iframe WITH allow=autoplay, no gesture', `http://127.0.0.1:${PARENT_PORT}/`, { gesture: false, policy });
  await run('cross-origin iframe WITHOUT allow, no gesture', `http://127.0.0.1:${PARENT_PORT2}/`, { gesture: false, policy });
  await run('cross-origin iframe WITH allow, parent gesture first', `http://127.0.0.1:${PARENT_PORT}/`, { gesture: true, policy });
  await runTop('TOP-LEVEL control (no iframe), no gesture', `http://127.0.0.1:${CHILD_PORT}/`, { policy });
}
sChild.close(); sA.close(); sB.close();
