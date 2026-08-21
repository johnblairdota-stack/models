#!/usr/bin/env node
/** scratch: measure the shipped phone page in a real browser. P1-P6, before numbers. */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { startShow } from '../../net/party/show.mjs';
import { PHASE } from '../../src/party/phases.js';

const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOW = 5321, PROXY = 5322, CDP = 9382;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = process.argv[2] || new URL('../../net/party/show-phone.html', import.meta.url).pathname;

function makeProxy({ port, target }) {
  const state = { html: '', accepting: true, muted: false, links: new Set(), upgrades: 0 };
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(state.html); });
  srv.on('upgrade', (req, sock, head) => {
    state.upgrades++;
    if (!state.accepting) { try { sock.destroy(); } catch {} return; }
    const up = net.connect(target, '127.0.0.1', () => {
      const lines = [`GET ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      const link = { sock, up }; state.links.add(link);
      up.on('data', (bf) => { if (!state.muted) { try { sock.write(bf); } catch {} } });
      sock.on('data', (bf) => { try { up.write(bf); } catch {} });
      const kill = () => { state.links.delete(link); try { sock.destroy(); } catch {} try { up.destroy(); } catch {} };
      up.on('close', kill); up.on('error', kill); sock.on('close', kill); sock.on('error', kill);
    });
    up.on('error', () => { try { sock.destroy(); } catch {} });
  });
  state.cutAll = () => { for (const l of [...state.links]) { try { l.sock.destroy(); } catch {} try { l.up.destroy(); } catch {} state.links.delete(l); } };
  state.close = () => new Promise((r) => { state.cutAll(); srv.close(r); });
  state.listen = () => new Promise((r) => srv.listen(port, '127.0.0.1', r));
  return state;
}

const SPY = `(() => {
  window.__sent = []; window.__got = []; window.__clicks = []; window.__canvasW = 0;
  const S = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { window.__sent.push({ at: performance.now(), d: String(d) }); return S.call(this, d); };
  addEventListener('click', (e) => { window.__clicks.push({ id: e.target && e.target.id, tag: e.target && e.target.tagName }); }, true);
  const D = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, get() { return D.get.call(this); },
    set(v) { window.__canvasW++; return D.set.call(this, v); },
  });
  const OM = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    configurable: true, get() { return OM.get.call(this); },
    set(fn) { OM.set.call(this, function (e) { window.__got.push({ at: performance.now(), t: (JSON.parse(e.data) || {}).t }); return fn.apply(this, arguments); }); },
  });
})()`;

async function browser() {
  const nonce = `ph${process.pid}`;
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${CDP}`, '--window-size=390,844',
    `--user-data-dir=/tmp/rrr-phb-${process.pid}`, `http://127.0.0.1:${PROXY}/blank?${nonce}`], { stdio: 'ignore' });
  const reap = () => { try { proc.kill(); } catch {} };
  process.once('exit', reap);
  process.once('uncaughtException', (e) => { reap(); console.error(e); process.exit(1); });
  await sleep(2600);
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const target = list.find((x) => x.type === 'page' && x.url.includes(nonce));
  if (!target) throw new Error('no page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const waits = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
  const call = async (method, params = {}) => {
    const i = ++id;
    const p = new Promise((res, rej) => { waits.set(i, res); setTimeout(() => { if (waits.delete(i)) rej(new Error(`${method} timed out`)); }, 20000); });
    ws.send(JSON.stringify({ id: i, method, params }));
    const r = await p; if (r.error) throw new Error(`${method}: ${r.error.message}`); return r.result;
  };
  const js = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  };
  return { proc, call, js, reap };
}

const proxy = makeProxy({ port: PROXY, target: SHOW });
proxy.html = readFileSync(PAGE, 'utf8');
await proxy.listen();
const show = startShow({ port: SHOW, code: 'hands', stamp: 1700000000000 });
const b = await browser();
await b.call('Page.enable'); await b.call('Runtime.enable');
await b.call('Page.addScriptToEvaluateOnNewDocument', { source: SPY });

const goto = async (url) => {
  await b.call('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(100); if (await b.js('document.readyState === "complete" && !!document.getElementById("go")').catch(() => false)) return; }
  throw new Error('never loaded');
};
const rect = (sel) => b.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
const press = async (p) => b.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
const release = async (p) => b.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });

await goto(`http://127.0.0.1:${PROXY}/p`);
await sleep(400);
await b.js(`document.getElementById('name').value='GUIDE'; document.getElementById('go').click(); 1`);
await sleep(400);
const phones = [];
for (let i = 0; i < 4; i++) {
  const p = new WebSocket(`ws://127.0.0.1:${SHOW}/`);
  await new Promise((r) => { p.onopen = r; });
  p.msgs = [];
  p.onmessage = (e) => { const m = JSON.parse(e.data); p.msgs.push(m); if (m.t === 'ping') p.send(JSON.stringify({ t: 'pong', at: m.at })); };
  p.send(JSON.stringify({ t: 'join', name: `R${i + 2}`, token: null, boot: 500 }));
  phones.push(p);
}
await sleep(300);
show.begin(Date.now());
const sess = show.sessionNow();
for (let i = 0; i < 8 && sess.state.phase !== PHASE.CASTING; i++) { sess.skip(Date.now()); await sleep(90); }

// ------------------------------------------------ D · the casting ballot, straddled
console.log('\n== CASTING ballot ==');
await sleep(200);
const pick = await rect('#controls [data-pick]');
const ballot = async (straddle) => {
  let landed = 0;
  for (let i = 0; i < 8; i++) {
    const before = await b.js(`document.querySelectorAll('#controls .on').length`);
    await press(pick);
    if (straddle) phones[i % 4].send(JSON.stringify({ t: 'act', msg: { t: 'cast', runner: 'p2', guide: 'p1' } }));
    await sleep(90);
    await release(pick);
    await sleep(90);
    const after = await b.js(`document.querySelectorAll('#controls .on').length`);
    if (after !== before) landed++;
  }
  return landed;
};
console.log(`  ballot taps with NO frame mid-tap (control): ${await ballot(false)}/8`);
console.log(`  ballot taps STRADDLING a frame:              ${await ballot(true)}/8`);
console.log('  click targets:', JSON.stringify(await b.js(`window.__clicks.slice(-6)`)));

for (const p of phones) p.send(JSON.stringify({ t: 'act', msg: { t: 'cast', runner: 'p2', guide: 'p1' } }));
await sleep(250);
sess.skip(Date.now());
await sleep(400);
console.log('\n== EXPEDITION, browser is the guide ==', sess.state.phase, JSON.stringify(sess.state.pair));

const sim = new WebSocket(`ws://127.0.0.1:${SHOW}/?role=sim`);
await new Promise((r) => { sim.onopen = r; });
const report = () => sim.send(JSON.stringify({ t: 'sim', runner: { x: 2, z: 2, room: 'ballroom', noise: 0.3 }, hunter: { x: 8, z: 5, room: 'ballroom', wallDist: 9 } }));

// ------------------------------------------------ A/B/E · frame storm
await b.js(`window.__got.length = 0; window.__canvasW = 0; window.__id = document.getElementById('cl'); window.__mapId = document.getElementById('map'); 1`);
const t0 = Date.now();
for (let i = 0; i < 50; i++) { report(); await sleep(20); }   // 50 reports at ~5x the sim's 5 Hz
await sleep(300);
const dt = (Date.now() - t0) / 1000;
const frames = await b.js(`window.__got.filter((m) => m.t === 'state').length`);
console.log(`  state frames received: ${frames} in ${dt.toFixed(2)}s`);
console.log(`  CLEAR node identity survived: ${await b.js(`window.__id === document.getElementById('cl')`)}`);
console.log(`  map canvas identity survived: ${await b.js(`window.__mapId === document.getElementById('map')`)}`);
console.log(`  canvas backing-store writes: ${await b.js(`window.__canvasW`)}`);
console.log(`  room label on the guide read: ${JSON.stringify(await b.js(`(document.querySelector('#controls .bad') || {}).textContent`))}`);

// ------------------------------------------------ C · the straddled CLEAR
await b.js(`window.__clicks.length = 0; 1`);
const cl = await rect('#cl');
await press(cl);
report();                      // one frame lands between down and up
await sleep(110);
await release(cl);
await sleep(250);
console.log(`  straddled CLEAR: click target = ${JSON.stringify(await b.js(`window.__clicks`))}`);
console.log(`  server heard the call: ${JSON.stringify(sess.state.call)}`);
// control: the same tap with no frame between down and up
await b.js(`window.__clicks.length = 0; 1`);
const hd = await rect('#hd');
if (hd) { await press(hd); await sleep(110); await release(hd); await sleep(250); }
console.log(`  quiet HOLD:      click target = ${JSON.stringify(await b.js(`window.__clicks`))}`);
console.log(`  server heard the call: ${JSON.stringify(sess.state.call)}`);

// ------------------------------------------------ P4 · what the marks look like
const marks = await b.js(`(() => {
  const c = document.getElementById('map'); if (!c) return null;
  const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
  let hunter = 0, you = 0, ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g2 = d[i+1], bl = d[i+2], a = d[i+3];
    if (a < 8) continue;
    if (Math.abs(r-228) < 24 && Math.abs(g2-72) < 24 && Math.abs(bl-58) < 24) hunter++;
    else if (Math.abs(r-76) < 24 && Math.abs(g2-194) < 24 && Math.abs(bl-122) < 24) you++;
    else if (r > 170 && g2 > 170 && bl > 170) ink++;
  }
  return { hunter, you, whiteInk: ink, w: c.width, h: c.height };
})()`);
console.log('  map palette:', JSON.stringify(marks));

// ------------------------------------------------ P2 · a tap during an outage (VOTE)
for (let i = 0; i < 10 && sess.state.phase !== PHASE.RECKONING; i++) { sess.skip(Date.now()); await sleep(160); }
console.log('\n== RECKONING ==', sess.state.phase);
for (const p of phones) p.send(JSON.stringify({ t: 'act', msg: { t: 'nominate', target: 'p3' } }));
await sleep(250);
for (let i = 0; i < 4 && sess.state.phase !== PHASE.VOTE; i++) { sess.skip(Date.now()); await sleep(200); }
await sleep(300);
console.log('== VOTE ==', sess.state.phase, 'noms', JSON.stringify(sess.state.nominations));
console.log('  vote sheet:', (await b.js(`document.getElementById('controls').textContent`)).slice(0, 90));

const vb = await rect('#controls [data-vote]');
if (!vb) { console.log('  NO VOTE BUTTON — sheet is:', (await b.js(`document.getElementById('controls').textContent`)).slice(0,120)); }
proxy.accepting = false; proxy.cutAll();       // the socket dies; reconnects fail
await sleep(700);
console.log(`  bar reads: ${JSON.stringify(await b.js(`document.getElementById('state').textContent`))}`);
await b.js(`window.__sent.length = 0; 1`);
await b.js(`window.__clicks.length = 0; 1`);
const vb2 = await rect('#controls [data-vote]');
console.log(`  rect before outage ${JSON.stringify(vb)} / now ${JSON.stringify(vb2)}`);
if (vb2) { await press(vb2); await sleep(80); await release(vb2); }
await sleep(300);
console.log(`  click during outage: ${JSON.stringify(await b.js(`window.__clicks`))}`);
console.log(`  banner: ${JSON.stringify(await b.js(`document.getElementById('offair').textContent`))}`);
console.log(`  chosen shown: ${await b.js(`!!document.querySelector('#controls [data-vote].on')`)}`);
console.log(`  page sent during the outage: ${JSON.stringify(await b.js(`window.__sent.map(x=>x.d.slice(0,60))`))}`);
console.log(`  any visible sign the tap was lost: ${JSON.stringify((await b.js(`document.body.textContent`)).match(/held|queued|off air|no signal|not sent/i))}`);
proxy.accepting = true;
for (let i = 0; i < 40; i++) { await sleep(250); if (await b.js(`document.getElementById('state').textContent`) === 'connected') break; }
await sleep(500);
console.log(`  banner after: ${JSON.stringify(await b.js(`document.getElementById('offair').textContent`))}`);
console.log(`  refused note: ${JSON.stringify(await b.js(`document.getElementById('refused').textContent`))}`);
console.log(`  after reconnect, page sent: ${JSON.stringify(await b.js(`window.__sent.map(x=>x.d.slice(0,60))`))}`);
sess.skip(Date.now()); await sleep(300);
console.log(`  tally: ${JSON.stringify(sess.state.tally)}`);

// ------------------------------------------------ P3 · half open
console.log('\n== half-open ==');
const up0 = proxy.upgrades;
proxy.muted = true;
await sleep(6000);
console.log(`  new socket attempts in 6 s of silence: ${proxy.upgrades - up0}`);
console.log(`  bar reads: ${JSON.stringify(await b.js(`document.getElementById('state').textContent`))}`);
console.log(`  readyState: ${await b.js(`(document.body && 1)`)}`);
proxy.muted = false;

b.reap();
for (const p of phones) try { p.close(); } catch {}
try { sim.close(); } catch {}
await proxy.close();
await show.close();
process.exit(0);
