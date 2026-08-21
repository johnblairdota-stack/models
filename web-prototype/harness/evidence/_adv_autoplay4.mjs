// the REAL shipped view, in the REAL cross-origin iframe shape show-tv.html builds.
import { chromium } from 'playwright';
import http from 'node:http';
const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PARENT = `<!doctype html><meta charset=utf8><body style="margin:0;background:#000">
<iframe id=f allow="autoplay" scrolling="no" src="http://127.0.0.1:5178/?view=party.expedition&chrome=feed" style="width:1280px;height:720px;border:0"></iframe>`;
await new Promise(r => http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end(PARENT);}).listen(5340,'127.0.0.1',r));
const INIT = `(() => { window.__acs = [];
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const W = function (...a) { const c = new AC(...a); const rec = { created: c.state, later: null };
    window.__acs.push(rec); setTimeout(()=>{ rec.later = c.state; }, 2000); return c; };
  W.prototype = AC.prototype; window.AudioContext = W; window.webkitAudioContext = W; })();`;
for (const [label, policy] of [['chrome desktop default', 'document-user-activation-required'], ['playwright/headless default', null]]) {
  const br = await chromium.launch({ executablePath: CHROME, args: [
    ...(policy ? [`--autoplay-policy=${policy}`] : []), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.addInitScript(INIT);
  await pg.goto('http://127.0.0.1:5340/');
  let fr = null, ready = null;
  for (let k = 0; k < 90; k++) {
    fr = pg.frames().find(f => f.url().startsWith('http://127.0.0.1:5178'));
    if (fr) { ready = await fr.evaluate(() => document.body?.dataset?.rrrReady ?? null).catch(()=>null); if (ready) break; }
    await sleep(1000);
  }
  await sleep(2500);
  const r = fr ? await fr.evaluate(() => ({ acs: window.__acs, active: navigator.userActivation?.hasBeenActive })).catch(e=>String(e)) : 'no frame';
  console.log(`${label.padEnd(28)} ready=${ready} ${JSON.stringify(r)}`);
  await br.close();
}
process.exit(0);
