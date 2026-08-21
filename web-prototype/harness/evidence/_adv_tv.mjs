// throwaway: the real television, the real vite house, the real party server.
import { chromium } from 'playwright';
import { startShow, playerIdOf } from '../../net/party/show.mjs';
import { PHASE } from '../../src/party/phases.js';
const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 5399;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function open(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const msgs = [];
    const box = { ws, msgs, send: o => ws.send(JSON.stringify(o)),
      act: m => ws.send(JSON.stringify({ t: 'act', msg: m })),
      of: ty => msgs.filter(m => m.t === ty), close: () => { try { ws.close(); } catch {} } };
    ws.onmessage = e => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t:'pong', at:m.at }); };
    ws.onopen = () => resolve(box); ws.onerror = () => resolve(box);
  });
}

const show = startShow({ port: PORT, code: 'advx', stamp: 1700000000000 });
await sleep(200);

const phones = [];
for (let i = 0; i < 5; i++) { const p = await open(); p.send({ t:'join', name:'R'+i }); phones.push(p); await sleep(60); }
await sleep(300);

const browser = await chromium.launch({ executablePath: CHROME, args: [
  '--autoplay-policy=document-user-activation-required',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
]});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('[' + (m.location().url||'').slice(0,60) + '] ' + m.text().slice(0, 200)); });
page.on('requestfailed', r => errs.push('[reqfail] ' + r.url().slice(0,120) + ' ' + (r.failure()?.errorText||'')));
page.on('response', r => { if (r.status() >= 400) errs.push('[http ' + r.status() + '] ' + r.url().slice(0,120)); });
page.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/?house=http://127.0.0.1:5178`);
await sleep(800);
console.log('frames before start:', page.frames().length);
await page.keyboard.press('Space');
await sleep(1200);
console.log('phase after start:', show.sessionNow()?.state.phase);
console.log('iframe mounted:', await page.evaluate(() => !!document.getElementById('feed')));
console.log('iframe src   :', await page.evaluate(() => document.getElementById('feed')?.src));

// cast so we reach EXPEDITION
const ids = phones.map((_, i) => playerIdOf(i));
for (let k = 0; k < 240 && show.sessionNow()?.state.phase !== PHASE.EXPEDITION; k++) {
  const ph = show.sessionNow()?.state.phase;
  if (ph === PHASE.CASTING) for (let i = 0; i < phones.length; i++) phones[i].act({ t:'cast', runner: ids[(i+1)%ids.length], guide: ids[(i+2)%ids.length] });
  await sleep(500);
}
console.log('phase now    :', show.sessionNow()?.state.phase);

// give the house time to boot three.js under swiftshader
for (let k = 0; k < 40; k++) {
  const st = await page.evaluate(() => ({
    ready: window.__feedReadySeen ?? null,
    hidden: document.getElementById('feed')?.classList.contains('hide'),
    frames: 0,
  })).catch(() => null);
  const f = page.frames().find(fr => fr.url().startsWith('http://127.0.0.1:5178'));
  if (f) {
    const inner = await f.evaluate(() => ({
      ready: document.body?.dataset?.rrrReady ?? null,
      audio: (window.__rrrAudioState ? window.__rrrAudioState() : null),
      exp: window.__rrrExpedition ?? null,
    })).catch(e => ({ err: String(e).slice(0,120) }));
    if (inner && (inner.ready || k === 39)) { console.log('house frame state:', JSON.stringify(inner)); break; }
  }
  await sleep(1000);
}
const f = page.frames().find(fr => fr.url().startsWith('http://127.0.0.1:5178'));
console.log('house frame present:', !!f, f && f.url().slice(0, 120));
if (f) {
  const probe = await f.evaluate(async () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    // Is the SHIPPED context running? Find it by making a new one and reading policy, plus report readiness.
    const test = new AC();
    const st = test.state;
    return { newContextState: st, bodyReady: document.body.dataset.rrrReady ?? null,
      hasBeenActive: navigator.userActivation?.hasBeenActive ?? 'n/a',
      canvases: document.querySelectorAll('canvas').length,
      lowerThird: document.body.innerText.slice(0, 200) };
  }).catch(e => ({ err: String(e).slice(0,200) }));
  console.log('inside the house:', JSON.stringify(probe));
}
console.log('feed hidden?', await page.evaluate(() => document.getElementById('feed')?.className));
console.log('console errors:', errs.slice(0, 12));
await page.screenshot({ path: '/tmp/claude-0/-home-user-models/e3bf1f3c-841f-54cd-b5db-805bb29c841c/scratchpad/adv_tv.png' });
await browser.close(); phones.forEach(p => p.close()); await show.close();
