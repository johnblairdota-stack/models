// autoplay4, minus the instrument's own gesture: playwright's frame.evaluate() grants a user
// activation (Runtime.evaluate userGesture:true), which is what made the earlier run say "running".
import { chromium } from 'playwright';
import http from 'node:http';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PARENT = `<!doctype html><meta charset=utf8><body style="margin:0;background:#000">
<iframe id=f allow="autoplay" scrolling="no" src="http://127.0.0.1:5178/?view=party.expedition&chrome=feed" style="width:1280px;height:720px;border:0"></iframe>`;
await new Promise(r => http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end(PARENT);}).listen(5360,'127.0.0.1',r));
const INIT = `(() => { window.__acs = [];
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const W = function (...a) { const c = new AC(...a);
    const rec = { created: c.state, activeAtCreate: navigator.userActivation?.hasBeenActive, later: null };
    window.__acs.push(rec); setTimeout(()=>{ rec.later = c.state; }, 4000); return c; };
  W.prototype = AC.prototype; window.AudioContext = W; window.webkitAudioContext = W; })();`;
const br = await chromium.launch({ executablePath: CHROME, args: [
  '--autoplay-policy=document-user-activation-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
await pg.addInitScript(INIT);
await pg.goto('http://127.0.0.1:5360/');
await pg.waitForTimeout(140000);          // NO frame.evaluate while the house boots
const fr = pg.frames().find(f => f.url().startsWith('http://127.0.0.1:5178'));
const r = fr ? await fr.evaluate(() => ({ acs: window.__acs, ready: document.body?.dataset?.rrrReady ?? null })) : 'no frame';
console.log('REAL shipped view, cross-origin iframe, no instrument gesture:');
console.log(' ', JSON.stringify(r));
await br.close(); process.exit(0);
