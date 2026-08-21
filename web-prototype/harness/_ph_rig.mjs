#!/usr/bin/env node
/** scratch: the phone-in-a-browser rig. Smoke run — join, cast, reach EXPEDITION as the guide. */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { startShow, playerIdOf } from '../net/party/show.mjs';
import { PHASE } from '../src/party/phases.js';

const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOW = 5311, PROXY = 5312, CDP = 9381;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the proxy
function makeProxy({ port, target }) {
  const state = { html: '', accepting: true, muted: false, links: new Set(), upgrades: 0 };
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(state.html);
  });
  srv.on('upgrade', (req, sock, head) => {
    state.upgrades++;
    if (!state.accepting) { try { sock.destroy(); } catch {} return; }
    const up = net.connect(target, '127.0.0.1', () => {
      const lines = [`GET ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      const link = { sock, up };
      state.links.add(link);
      up.on('data', (b) => { if (!state.muted) { try { sock.write(b); } catch {} } });
      sock.on('data', (b) => { try { up.write(b); } catch {} });
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

// ---------------------------------------------------------------- CDP
async function browser() {
  const nonce = `ph${process.pid}`;
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${CDP}`, '--window-size=390,844',
    `--user-data-dir=/tmp/rrr-ph-${process.pid}`, `http://127.0.0.1:${PROXY}/blank?${nonce}`], { stdio: 'ignore' });
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
    const p = new Promise((res, rej) => {
      waits.set(i, res);
      setTimeout(() => { if (waits.delete(i)) rej(new Error(`${method} timed out`)); }, 20000);
    });
    ws.send(JSON.stringify({ id: i, method, params }));
    const r = await p;
    if (r.error) throw new Error(`${method}: ${r.error.message}`);
    return r.result;
  };
  const js = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  };
  return { proc, call, js, reap };
}

const SPY = `(() => {
  window.__sent = []; window.__got = []; window.__clicks = [];
  const S = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { window.__sent.push({ at: performance.now(), d: String(d) }); } catch (e) {} return S.call(this, d); };
  const A = WebSocket.prototype.addEventListener;
  const seen = new WeakSet();
  const watch = (sock) => { if (seen.has(sock)) return; seen.add(sock); };
  addEventListener('click', (e) => { window.__clicks.push({ id: e.target && e.target.id, tag: e.target && e.target.tagName }); }, true);
  const OM = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    configurable: true,
    get() { return OM.get.call(this); },
    set(fn) { OM.set.call(this, function (e) { try { window.__got.push({ at: performance.now(), d: String(e.data).slice(0, 40) }); } catch (er) {} return fn.apply(this, arguments); }); },
  });
})()`;

// ---------------------------------------------------------------- main
const proxy = makeProxy({ port: PROXY, target: SHOW });
proxy.html = readFileSync(new URL('../net/party/show-phone.html', import.meta.url), 'utf8');
await proxy.listen();
const show = startShow({ port: SHOW, code: 'hands', stamp: 1700000000000 });
const b = await browser();
await b.call('Page.enable');
await b.call('Runtime.enable');
await b.call('Page.addScriptToEvaluateOnNewDocument', { source: SPY });

const goto = async (url) => {
  await b.call('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(100); if (await b.js('document.readyState === "complete" && !!document.getElementById("go")').catch(() => false)) return; }
  throw new Error('never loaded');
};
await goto(`http://127.0.0.1:${PROXY}/p`);
await sleep(400);
await b.js(`document.getElementById('name').value='GUIDE'; document.getElementById('go').click(); 1`);
await sleep(400);
console.log('seated?', await b.js(`document.getElementById('me').textContent`), 'seats', show.lobby.seats.size);

// four node phones
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
console.log('lobby seats', [...show.lobby.seats.values()].map((s) => `${s.seat}:${s.name}`).join(' '));
show.begin(Date.now());
const sess = show.sessionNow();
for (let i = 0; i < 8 && sess.state.phase !== PHASE.CASTING; i++) { sess.skip(Date.now()); await sleep(90); }
console.log('phase', sess.state.phase);
for (const p of phones) p.send(JSON.stringify({ t: 'act', msg: { t: 'cast', runner: 'p2', guide: 'p1' } }));
await sleep(250);
sess.skip(Date.now());
await sleep(300);
console.log('phase', sess.state.phase, 'pair', JSON.stringify(sess.state.pair));
console.log('page phase', await b.js(`document.getElementById('ph').textContent`));
console.log('controls', (await b.js(`document.getElementById('controls').textContent`)).slice(0, 120));

// sim socket
const sim = new WebSocket(`ws://127.0.0.1:${SHOW}/?role=sim`);
await new Promise((r) => { sim.onopen = r; });
const ROOMS = ['ballroom', 'gallery', 'study_w', 'study_e', 'service', 'chapel'];
for (const room of ROOMS) {
  sim.send(JSON.stringify({ t: 'sim', runner: { x: 2, z: 2, room: 'ballroom', noise: 0.3 }, hunter: { x: 8, z: 5, room, wallDist: 9 } }));
  await sleep(150);
  const seen = await b.js(`!!document.querySelector('#controls .bad')`);
  console.log('room', room, 'hunter seen on phone:', seen, '| has map:', await b.js(`!!document.getElementById('map')`));
  if (seen) break;
}
console.log('controls now', (await b.js(`document.getElementById('controls').textContent`)).slice(0, 160));
console.log('cl button?', await b.js(`!!document.getElementById('cl')`));

b.reap();
for (const p of phones) try { p.close(); } catch {}
try { sim.close(); } catch {}
await proxy.close();
await show.close();
process.exit(0);
