#!/usr/bin/env node
/** scratch: measure the shipped phone page in a real browser. P1-P6, before numbers. */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { startShow } from '../net/party/show.mjs';
import { PHASE } from '../src/party/phases.js';

const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOW = 5331, PROXY = 5332, CDP = 9383;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = process.argv[2] || new URL('../net/party/show-phone.html', import.meta.url).pathname;

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
const show = startShow({ port: SHOW, code: 'runr', stamp: 1700000000000 });
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
await b.js(`document.getElementById('name').value='RUNNER'; document.getElementById('go').click(); 1`);
await sleep(400);
const phones = [];
for (let i = 0; i < 4; i++) {
  const p = new WebSocket(`ws://127.0.0.1:${SHOW}/`);
  await new Promise((r) => { p.onopen = r; });
  p.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'ping') p.send(JSON.stringify({ t: 'pong', at: m.at })); };
  p.send(JSON.stringify({ t: 'join', name: `R${i + 2}`, token: null, boot: 500 }));
  phones.push(p);
}
await sleep(300);
show.begin(Date.now());
const sess = show.sessionNow();
for (let i = 0; i < 8 && sess.state.phase !== PHASE.CASTING; i++) { sess.skip(Date.now()); await sleep(90); }
for (const p of phones) p.send(JSON.stringify({ t: 'act', msg: { t: 'cast', runner: 'p1', guide: 'p2' } }));
await sleep(250);
sess.skip(Date.now());
await sleep(400);
console.log('EXPEDITION', sess.state.phase, JSON.stringify(sess.state.pair));

const sim = new WebSocket(`ws://127.0.0.1:${SHOW}/?role=sim`);
await new Promise((r) => { sim.onopen = r; });
const simMsgs = [];
sim.onmessage = (e) => simMsgs.push(JSON.parse(e.data));
sim.send(JSON.stringify({ t: 'sim', runner: { x: 2, z: 2, room: 'ballroom', noise: 0.3 }, hunter: { x: 8, z: 5, room: 'ballroom', wallDist: 9 } }));
await sleep(200);
phones[0].send(JSON.stringify({ t: 'act', msg: { t: 'call', call: 'CLEAR' } }));
await sleep(400);
console.log('drive card?', await b.js(`!!document.getElementById('stick')`), '|', (await b.js(`document.getElementById('controls').textContent`)).slice(0, 70));

const st = await b.js(`(() => { const e = document.getElementById('stick'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width }; })()`);
// ---- P6 · the pointermove storm
await b.js(`window.__sent.length = 0; 1`);
await b.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: st.x, y: st.y, button: 'left', clickCount: 1, buttons: 1 });
const T0 = Date.now();
for (let i = 0; i < 60; i++) {
  await b.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: st.x + Math.sin(i / 6) * st.w * 0.3, y: st.y + Math.cos(i / 6) * st.w * 0.3, button: 'left', buttons: 1 });
}
const T1 = Date.now();
await b.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: st.x, y: st.y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(200);
const drives = await b.js(`window.__sent.filter((m) => m.d.includes('"drive"')).length`);
console.log(`P6: 60 pointermoves over ${T1 - T0} ms -> ${drives} drive messages sent (${(drives / ((T1 - T0) / 1000)).toFixed(0)}/s)`);
console.log(`    sim socket received: ${simMsgs.filter((m) => m.t === 'drive').length} drive relays`);

// ---- P5 · the leaked timer
for (let i = 0; i < 12 && sess.state.phase === PHASE.EXPEDITION; i++) { sess.skip(Date.now()); await sleep(120); }
console.log('phase now', sess.state.phase);
await sleep(400);
await b.js(`window.__sent.length = 0; 1`);
await sleep(3000);
const after = await b.js(`window.__sent.filter((m) => m.d.includes('"drive"')).length`);
console.log(`P5: drive messages sent in 3 s AFTER the expedition ended: ${after} (${(after / 3).toFixed(1)}/s)`);

b.reap();
for (const p of phones) try { p.close(); } catch {}
try { sim.close(); } catch {}
await proxy.close();
await show.close();
process.exit(0);
