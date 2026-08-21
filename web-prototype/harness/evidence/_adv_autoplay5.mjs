import { chromium } from 'playwright';
import http from 'node:http';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHILD = `<!doctype html><meta charset=utf8><body><script>
window.__r={}; const AC=window.AudioContext||window.webkitAudioContext; const c=new AC();
window.__r.created=c.state; setTimeout(()=>{window.__r.later=c.state;window.__r.active=navigator.userActivation?.hasBeenActive;},2000);
<\/script>`;
await new Promise(r=>http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end(CHILD);}).listen(5351,'127.0.0.1',r));
const mkParent = (src) => `<!doctype html><meta charset=utf8><body style="margin:0"><iframe id=f allow="autoplay" src="${src}" style="width:1280px;height:720px;border:0"></iframe>`;
const serve = (port, body) => new Promise(r=>http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end(body);}).listen(port,'127.0.0.1',r));
await serve(5352, mkParent('http://127.0.0.1:5351/'));
await serve(5353, mkParent('http://127.0.0.1:5178/'));
const INIT = `(() => { window.__acs=[]; const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
  const W=function(...a){const c=new AC(...a);const r={created:c.state,later:null};window.__acs.push(r);setTimeout(()=>r.later=c.state,2000);return c;};
  W.prototype=AC.prototype; window.AudioContext=W; window.webkitAudioContext=W; })();`;
const ARGSETS = [['plain', []], ['swiftshader args', ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']]];
for (const [an, extra] of ARGSETS) {
  for (const [label, url, port] of [['minimal child', 'http://127.0.0.1:5352/', 5351], ['vite launcher index.html', 'http://127.0.0.1:5353/', 5178]]) {
    const br = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=document-user-activation-required', ...extra] });
    const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
    await pg.addInitScript(INIT);
    await pg.goto(url); await sleep(6000);
    const fr = pg.frames().find(f => f.url().includes(':' + port));
    const r = fr ? await fr.evaluate(() => ({ r: window.__r ?? null, acs: window.__acs ?? null, active: navigator.userActivation?.hasBeenActive })).catch(e=>String(e).slice(0,120)) : 'no frame';
    console.log(`${an.padEnd(18)} ${label.padEnd(26)} ${JSON.stringify(r)}`);
    await br.close();
  }
}
process.exit(0);
