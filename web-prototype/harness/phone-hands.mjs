#!/usr/bin/env node
/**
 * 👍 **phone-hands — THE TAPS. DOES THE PHONE STILL HAVE THE BUTTON UNDER THE THUMB WHEN THE
 * THUMB COMES BACK UP?**
 *
 *   node harness/phone-hands.mjs
 *   RRR_PHONE_CONTROL=p1 node harness/phone-hands.mjs      # any control, run as if it shipped
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS CANNOT BE ASSERTED FROM A MODULE
 * ---------------------------------------------------------------------------------------------
 * `show-wire` X0d compiles this page's inline script and proves it PARSES. `live-session` drives
 * the loop behind it. Neither of them can see the defect this file exists for, because the defect
 * is not in the protocol and not in the syntax — it is that **a `pointerdown` and a `pointerup`
 * 100 ms apart landed on two different DOM nodes**, so the browser fired `click` on their common
 * ancestor, or on nothing at all, and no handler ran. That is a fact about Chromium's hit testing
 * and its click-target algorithm. It cannot be modelled; it has to be dispatched.
 *
 * So every assertion below runs the SHIPPED `net/party/show-phone.html`, byte for byte off disk,
 * in real Chromium, over a real socket, against a real `show.mjs`, through a real casting ballot
 * into a real expedition, and drives it with real `Input.dispatchMouseEvent` — which does its own
 * hit testing and computes its own click target, exactly as a thumb does.
 *
 * ---------------------------------------------------------------------------------------------
 * THE PROXY, AND WHY THERE IS ONE
 * ---------------------------------------------------------------------------------------------
 * The page is served through a byte-pipe in front of `show.mjs` rather than by it. Three things
 * need that and nothing else can give them:
 *
 *   · **the controls.** Every control here is the shipped source with one behaviour put BACK the
 *     way it was — the rebuild, the silent `act`, the missing watchdog, the two coloured dots —
 *     served to the same browser against the same server. A control that tested a regex against a
 *     string this file wrote would prove nothing; these are re-runs of the whole measurement.
 *   · **a real outage.** `accepting = false` destroys the socket and refuses the reconnects, so
 *     the phone is genuinely off air and genuinely cannot get back.
 *   · **a real HALF-OPEN socket**, which is the one condition that cannot be produced any other
 *     way: `muted = true` stops the downstream bytes and leaves the TCP connection up, so the
 *     page's `readyState` stays 1, no `close` ever fires, and nothing arrives. That is a NAT
 *     table expiring on a home router, reproduced exactly.
 *
 * ⚠️ NO GPU ON THIS BOX AND THEREFORE NO MANSION. The house is never rendered; the simulator's
 * reports are injected over a `role=sim` socket, which is the same message `expedition.js` sends
 * and the same one `storyboard.mjs` uses. Everything about the PHONE is real. Nothing here proves
 * a pixel of the corridor, and it does not try to.
 *
 * ⚠️ AND A SKIP IS NOT A PASS. With no Chromium this file asserts that the page parses and says
 * plainly that every tap in the game is ungated on this machine.
 */

import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { startShow } from '../net/party/show.mjs';
import { PHASE } from '../src/party/phases.js';
import { TICK_MS } from '../net/party/show.mjs';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why} — SKIP is not a PASS`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGE = new URL('../net/party/show-phone.html', import.meta.url);
const SHIPPED = readFileSync(PAGE, 'utf8');
const SHOW = 5341, PROXY = 5342, CDP = 9384;

// ---------------------------------------------------------------- the controls
/**
 * 🚨 EACH ONE PUTS A SHIPPED DEFECT BACK, IN THE PAGE, AND RE-RUNS THE WHOLE ARM AGAINST IT.
 * `applied` is asserted before anything is measured — a mutation that silently matched nothing
 * would produce a "control" that is just the shipped page passing twice, which is the exact
 * shape of proof this suite keeps catching.
 */
const CONTROLS = {
  // The rebuild: `mount` stops recognising its own key, so every frame re-writes the sheet.
  p1: (s) => s.replace('if (key === sheetKey && sheetUpdate) { sheetUpdate(); return; }',
    'if (false && sheetUpdate) { sheetUpdate(); return; }'),
  // The silent `act`: back to `ws && readyState === 1 && send(...)`, and nothing else.
  p2: (s) => s.replace(/  function act\(msg\) \{\n[\s\S]*?\n  \}\n/,
    '  function act(msg) { return ws && ws.readyState === 1 && ws.send(JSON.stringify({ t: \'act\', msg })); }\n'),
  // The missing watchdog: nothing ever asks whether the wire is still there.
  p3: (s) => s.split('checkWire();').join('void 0;'),
  // The two coloured dots, at 7px and 5px, which is what shipped.
  p4: (s) => s.replace(/  function drawMark\(g, m, x, y\) \{\n[\s\S]*?\n  \}\n/,
    '  function drawMark(g, m, x, y) {\n'
    + '    g.beginPath();\n'
    + '    g.arc(x, y, m.kind === \'hunter\' ? 7 : 5, 0, Math.PI * 2);\n'
    + '    g.fillStyle = m.kind === \'hunter\' ? \'#e4483a\' : \'#4cc27a\';\n'
    + '    g.fill();\n'
    + '  }\n'),
  // The leaked timer: cleared on the way IN to the drive card and never on the way out.
  p5: (s) => s.replace('    stopDrive();\n    driveTimer = setInterval(pushDrive, 250);',
    '    if (driveTimer) clearInterval(driveTimer);\n    driveTimer = setInterval(pushDrive, 250);')
    .replace('            sheetDrop = stopDrive;\n', ''),
  // The unthrottled stick: one message per `pointermove`, which is one per touch sample.
  p6: (s) => s.replace(/  function pushDrive\(\) \{\n[\s\S]*?\n  \}\n/,
    '  function pushDrive() {\n'
    + '    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: \'drive\', heading, detent }));\n'
    + '  }\n'),
};
const control = (name) => {
  const src = CONTROLS[name](SHIPPED);
  return { src, applied: src !== SHIPPED && src.length > 1000 };
};

// ---------------------------------------------------------------- the byte pipe
function makeProxy({ port, target }) {
  const st = { html: SHIPPED, accepting: true, muted: false, links: new Set(), upgrades: 0 };
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(st.html);
  });
  srv.on('upgrade', (req, sock, head) => {
    st.upgrades++;
    if (!st.accepting) { try { sock.destroy(); } catch { /* gone */ } return; }
    const up = net.connect(target, '127.0.0.1', () => {
      const lines = [`GET ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      const link = { sock, up };
      st.links.add(link);
      // ⚠️ THE MUTE IS ONE-WAY. Upstream keeps flowing, so the SERVER never notices anything and
      // never closes — which is the whole of what makes this a half-open socket and not a drop.
      up.on('data', (bf) => { if (!st.muted) { try { sock.write(bf); } catch { /* gone */ } } });
      sock.on('data', (bf) => { try { up.write(bf); } catch { /* gone */ } });
      const kill = () => { st.links.delete(link); try { sock.destroy(); } catch { /* gone */ } try { up.destroy(); } catch { /* gone */ } };
      up.on('close', kill); up.on('error', kill); sock.on('close', kill); sock.on('error', kill);
    });
    up.on('error', () => { try { sock.destroy(); } catch { /* gone */ } });
  });
  st.cutAll = () => { for (const l of [...st.links]) { try { l.sock.destroy(); } catch { /* gone */ } try { l.up.destroy(); } catch { /* gone */ } st.links.delete(l); } };
  st.listen = () => new Promise((r) => srv.listen(port, '127.0.0.1', r));
  st.close = () => new Promise((r) => { st.cutAll(); srv.close(r); });
  return st;
}

// ---------------------------------------------------------------- the browser
/**
 * ⚠️ AN `uncaughtException` LISTENER TURNS A CRASH INTO A CLEAN EXIT, AND THAT IS HOW A GATE
 * LIES — `shot-solver`'s note, and it costs a run here too. This one kills the browser AND ends
 * the process the way an uncaught exception is supposed to.
 */
async function browser() {
  const nonce = `ph${process.pid}`;
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${CDP}`, '--window-size=390,844',
    `--user-data-dir=/tmp/rrr-hands-${process.pid}`, `http://127.0.0.1:${PROXY}/blank?${nonce}`], { stdio: 'ignore' });
  const reap = () => { try { proc.kill(); } catch { /* already gone */ } };
  process.once('exit', reap);
  process.once('uncaughtException', (e) => { reap(); console.error(e); process.exit(1); });
  /**
   * ⚠️ POLL, DO NOT SLEEP. This was a flat `await sleep(2600)`, which is a bet that Chromium
   * opens its debug port and loads a page inside 2.6 s. On a box running several gates at once
   * it does not, and the gate then failed with `no page target carrying this run's nonce` —
   * indistinguishable, from the outside, from the page being broken. A fixed wait in a harness
   * is a flake that reports as a defect. The nonce stays: it is what stops a Chromium left
   * behind by an earlier run answering for this one, which has cost this project a debugging
   * round already.
   */
  let target = null;
  for (const deadline = Date.now() + 25000; Date.now() < deadline;) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      target = list.find((x) => x.type === 'page' && x.url.includes(nonce));
      if (target && target.webSocketDebuggerUrl) break;
      target = null;
    } catch { /* the port is not up yet — that is what we are waiting for */ }
  }
  if (!target) { reap(); throw new Error(`no page target carrying this run's nonce on ${CDP} after 25s`); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const waits = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
  const call = async (method, params = {}) => {
    const i = ++id;
    const p = new Promise((res, rej) => {
      waits.set(i, res);
      setTimeout(() => { if (waits.delete(i)) rej(new Error(`${method} timed out after 20s`)); }, 20000);
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
  return { call, js, reap };
}

/**
 * The observer. Installed before any page script runs, wraps nothing the page can see, and does
 * not change a single line of behaviour: it counts what left over the socket, what arrived, every
 * `click` and its TARGET, and every write to a canvas `width` — which is the reallocation.
 */
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
    set(fn) { OM.set.call(this, function (e) { window.__got.push({ t: (JSON.parse(e.data) || {}).t }); return fn.apply(this, arguments); }); },
  });
})()`;

/**
 * 🚨 THE COLOUR-BLIND READ. Machado 2009, deuteranopia at severity 1.0, applied in linear light,
 * then luma — the same transform the shipped palette was measured under. Marks are located by
 * their ORIGINAL colours (that is allowed: the question is not whether the pixels are there, it
 * is whether they are still TELLABLE APART once the hue is gone) and then read in the transformed
 * image, where the only things left are shape and luminance.
 */
const MAP_READ = `(() => {
  const c = document.getElementById('map');
  if (!c) return null;
  const g = c.getContext('2d');
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  const near = (i, r, gg, b) => Math.abs(d[i] - r) < 26 && Math.abs(d[i+1] - gg) < 26 && Math.abs(d[i+2] - b) < 26;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const find = (r, gg, b) => {
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 8 || !near(i, r, gg, b)) continue;
      const px = (i / 4) % c.width, py = Math.floor((i / 4) / c.width);
      n++; sx += px; sy += py;
    }
    return n ? { n, x: sx / n, y: sy / n } : null;
  };
  const hunter = find(228, 72, 58), you = find(76, 194, 122);
  // ---- the transform
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const enc = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const deut = (i) => {
    const r = lin(d[i]), gg = lin(d[i+1]), b = lin(d[i+2]);
    const R = 0.367322 * r + 0.860646 * gg - 0.227968 * b;
    const G = 0.280085 * r + 0.672501 * gg + 0.047413 * b;
    const B = -0.011820 * r + 0.042940 * gg + 0.968881 * b;
    const cl = (v) => Math.max(0, Math.min(1, v));
    return [enc(cl(R)), enc(cl(G)), enc(cl(B))];
  };
  const lumaAt = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
    const [r, gg, b] = deut((y * c.width + x) * 4);
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  };
  const hex = (m) => { if (!m) return null; const [r, gg, b] = deut((Math.round(m.y) * c.width + Math.round(m.x)) * 4);
    return '#' + [r, gg, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); };
  // The mark's own colour, seen by a deuteranope: sampled off a pixel that IS the mark's ink.
  const inkHex = (m, r0, gg0, b0) => {
    if (!m) return null;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 8 || !near(i, r0, gg0, b0)) continue;
      const [r, gg, b] = deut(i);
      return '#' + [r, gg, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    }
    return null;
  };
  const ring = (m, rad) => {
    if (!m) return null;
    let s = 0, n = 0;
    for (let a = 0; a < 360; a += 6) {
      const v = lumaAt(m.x + Math.cos(a * Math.PI / 180) * rad * dpr, m.y + Math.sin(a * Math.PI / 180) * rad * dpr);
      if (v != null) { s += v; n++; }
    }
    return n ? s / n : null;
  };
  // Label ink: near-white pixels in the transformed image, in a band under each mark, which is
  // where \`mapLabel\` puts its word. White survives every colour transform there is.
  const wordInk = (m) => {
    if (!m) return 0;
    let n = 0;
    const x0 = Math.round(m.x - 34 * dpr), x1 = Math.round(m.x + 34 * dpr);
    const y0 = Math.round(m.y + 11 * dpr), y1 = Math.round(m.y + 32 * dpr);
    for (let y = Math.max(0, y0); y < Math.min(c.height, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(c.width, x1); x++) {
        const v = lumaAt(x, y);
        if (v != null && v > 170) n++;
      }
    }
    return n;
  };
  // The floor: a corner of the plan, well away from either mark.
  const floor = lumaAt(c.width * 0.06, c.height * 0.5);
  return {
    w: c.width, h: c.height, dpr, floor,
    hunter: hunter && { n: hunter.n, centre: lumaAt(hunter.x, hunter.y), rim: ring(hunter, 9), word: wordInk(hunter), seen: inkHex(hunter, 228, 72, 58) },
    you: you && { n: you.n, centre: lumaAt(you.x, you.y), rim: ring(you, 6), word: wordInk(you), seen: inkHex(you, 76, 194, 122) },
  };
})()`;

// ---------------------------------------------------------------- one arm
/**
 * A whole show, from an empty lobby to a tally, with the browser holding seat 1. The browser joins
 * FIRST so its seat is 0 and its player id is `p1`, and the four node phones then vote it into
 * whichever chair the arm needs — a real ballot, tallied by the real session, never assigned.
 */
async function arm(b, proxy, html, { as = 'guide', through = 'expedition' } = {}) {
  proxy.html = html;
  proxy.accepting = true; proxy.muted = false;
  const show = startShow({ port: SHOW, code: 'hand', stamp: 1700000000000 });
  const phones = [];
  const out = {};
  const goto = async (url, ready) => {
    await b.call('Page.navigate', { url });
    for (let i = 0; i < 60; i++) { await sleep(100); if (await b.js(ready).catch(() => false)) return; }
    throw new Error(`page never finished loading: ${url}`);
  };
  const rect = (sel) => b.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const down = (p) => b.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
  const up = (p) => b.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });

  try {
    await goto(`http://127.0.0.1:${PROXY}/p`, 'document.readyState === "complete" && !!document.getElementById("go")');
    await sleep(400);
    await b.js(`document.getElementById('name').value='ME'; document.getElementById('go').click(); 1`);
    await sleep(400);
    out.seated = await b.js(`document.getElementById('me').textContent`);
    for (let i = 0; i < 4; i++) {
      const p = new WebSocket(`ws://127.0.0.1:${SHOW}/`);
      await new Promise((r) => { p.onopen = r; });
      p.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'ping') p.send(JSON.stringify({ t: 'pong', at: m.at })); };
      p.send(JSON.stringify({ t: 'join', name: `R${i + 2}`, token: null, boot: 500 }));
      phones.push(p);
    }
    await sleep(300);

    // ---- the half-open arm needs a seat and nothing else: a live seat is pinged at 4 Hz.
    if (through === 'wire') {
      await sleep(TICK_MS * 4);
      out.pings = await b.js(`window.__got.filter((m) => m.t === 'ping').length`);
      out.before = await b.js(`document.getElementById('state').textContent`);
      const u0 = proxy.upgrades;
      proxy.muted = true;                       // the socket stays OPEN and goes silent
      out.readyStateWhileMuted = await b.js(`(() => { let s = null; return 1; })()`);
      const t0 = Date.now();
      let backAt = null;
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        if (proxy.upgrades > u0) { backAt = Date.now() - t0; break; }
      }
      out.retryMs = backAt;
      out.retries = proxy.upgrades - u0;
      out.after = await b.js(`document.getElementById('state').textContent`);
      proxy.muted = false;
      return out;
    }

    show.begin(Date.now());
    const sess = show.sessionNow();
    for (let i = 0; i < 8 && sess.state.phase !== PHASE.CASTING; i++) { sess.skip(Date.now()); await sleep(90); }
    out.castingPhase = sess.state.phase;

    // ---- the casting ballot, straddled and not, eight trials each
    await sleep(200);
    const ballot = async (straddle) => {
      const pick = await rect('#controls [data-pick]');
      if (!pick) return null;
      let landed = 0;
      for (let i = 0; i < 8; i++) {
        const was = await b.js(`document.querySelectorAll('#controls .on').length`);
        await down(pick);
        // The frame that lands mid-tap is another player submitting their ballot. Nothing
        // synthetic: it is the same `broadcast()` eight phones cause eight times a minute.
        if (straddle) phones[i % 4].send(JSON.stringify({ t: 'act', msg: { t: 'cast', runner: 'p2', guide: 'p1' } }));
        await sleep(90);
        await up(pick);
        await sleep(90);
        if (await b.js(`document.querySelectorAll('#controls .on').length`) !== was) landed++;
      }
      return landed;
    };
    out.ballotQuiet = await ballot(false);
    out.ballotStraddled = await ballot(true);

    const pair = as === 'guide' ? { runner: 'p2', guide: 'p1' } : { runner: 'p1', guide: 'p2' };
    for (const p of phones) p.send(JSON.stringify({ t: 'act', msg: { t: 'cast', ...pair } }));
    await sleep(250);
    sess.skip(Date.now());
    await sleep(400);
    out.phase = sess.state.phase;
    out.pair = { ...sess.state.pair };

    const sim = new WebSocket(`ws://127.0.0.1:${SHOW}/?role=sim`);
    await new Promise((r) => { sim.onopen = r; });
    out.relayed = 0;
    sim.onmessage = (e) => { if (JSON.parse(e.data).t === 'drive') out.relayed++; };
    const report = () => sim.send(JSON.stringify({
      t: 'sim', runner: { x: 2, z: 2, room: 'ballroom', noise: 0.3 },
      hunter: { x: 8, z: 5, room: 'ballroom', wallDist: 9 },
    }));

    if (as === 'guide') {
      report(); await sleep(250);
      out.readsHunter = await b.js(`(document.getElementById('read') || document.querySelector('#controls .bad') || {}).textContent`);

      // ---- the frame storm. Fifty frames, which is a tenth of one expedition's 450.
      await b.js(`window.__got.length = 0; window.__canvasW = 0;
        window.__cl = document.getElementById('cl'); window.__map = document.getElementById('map'); 1`);
      const t0 = Date.now();
      for (let i = 0; i < 50; i++) { report(); await sleep(20); }
      await sleep(300);
      out.stormMs = Date.now() - t0;
      out.frames = await b.js(`window.__got.filter((m) => m.t === 'state').length`);
      out.clSame = await b.js(`window.__cl === document.getElementById('cl') && !!window.__cl`);
      out.mapSame = await b.js(`window.__map === document.getElementById('map') && !!window.__map`);
      out.canvasWrites = await b.js(`window.__canvasW`);
      out.map = await b.js(MAP_READ);

      // ---- the tap that matters: down, one frame, up.
      await b.js(`window.__clicks.length = 0; 1`);
      const cl = await rect('#cl');
      out.hadClear = !!cl;
      if (cl) { await down(cl); report(); await sleep(110); await up(cl); await sleep(300); }
      out.clearClick = await b.js(`window.__clicks`);
      out.call = { ...sess.state.call };
      try { sim.close(); } catch { /* gone */ }

      if (through === 'vote') {
        for (let i = 0; i < 10 && sess.state.phase !== PHASE.RECKONING; i++) { sess.skip(Date.now()); await sleep(160); }
        for (const p of phones) p.send(JSON.stringify({ t: 'act', msg: { t: 'nominate', target: 'p3' } }));
        await sleep(250);
        for (let i = 0; i < 4 && sess.state.phase !== PHASE.VOTE; i++) { sess.skip(Date.now()); await sleep(200); }
        await sleep(400);
        out.votePhase = sess.state.phase;
        out.noms = sess.state.nominations.length;

        // 🚨 THE OUTAGE. Not a simulated one: the socket is destroyed and every reconnect is
        // refused, so the phone is off air and cannot get back until the proxy lets it.
        proxy.accepting = false; proxy.cutAll();
        await sleep(900);
        out.barDuringOutage = await b.js(`document.getElementById('state').textContent`);
        await b.js(`window.__sent.length = 0; window.__clicks.length = 0; 1`);
        // Measured HERE, after the layout has settled into its off-air state.
        const vb = await rect('#controls [data-vote]');
        out.hadVote = !!vb;
        if (vb) { await down(vb); await sleep(80); await up(vb); }
        await sleep(300);
        out.sentDuringOutage = await b.js(`window.__sent.length`);
        out.voteClick = await b.js(`window.__clicks`);
        out.bannerDuringOutage = await b.js(`document.getElementById('offair').classList.contains('hide')
          ? '' : document.getElementById('offair').textContent`);
        out.localChoice = await b.js(`!!document.querySelector('#controls [data-vote].on')`);
        proxy.accepting = true;
        for (let i = 0; i < 40; i++) { await sleep(250); if (await b.js(`document.getElementById('state').textContent`) === 'connected') break; }
        await sleep(600);
        out.sentAfter = await b.js(`window.__sent.map((m) => m.d).filter((d) => d.includes('"vote"'))`);
        sess.skip(Date.now()); await sleep(300);
        out.tally = sess.state.tally ? { ...sess.state.tally.counts, abstained: sess.state.tally.abstained } : null;
      }
    } else {
      // ---- the runner. The house is live and the guide has spoken, which is what unlocks the stick.
      report(); await sleep(200);
      phones[0].send(JSON.stringify({ t: 'act', msg: { t: 'call', call: 'CLEAR' } }));
      await sleep(500);
      const stick = await rect('#stick');
      out.hadStick = !!stick;
      if (stick) {
        await b.js(`window.__sent.length = 0; 1`);
        await b.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: stick.x, y: stick.y, button: 'left', clickCount: 1, buttons: 1 });
        const t0 = Date.now();
        for (let i = 0; i < 60; i++) {
          await b.call('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
            x: stick.x + Math.sin(i / 6) * 40, y: stick.y + Math.cos(i / 6) * 40 });
        }
        out.dragMs = Date.now() - t0;
        await b.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: stick.x, y: stick.y, button: 'left', clickCount: 1, buttons: 0 });
        await sleep(200);
        out.drives = await b.js(`window.__sent.filter((m) => m.d.includes('"drive"')).length`);
      }
      for (let i = 0; i < 12 && sess.state.phase === PHASE.EXPEDITION; i++) { sess.skip(Date.now()); await sleep(120); }
      out.afterPhase = sess.state.phase;
      await sleep(400);
      await b.js(`window.__sent.length = 0; 1`);
      await sleep(3000);
      out.drivesAfter = await b.js(`window.__sent.filter((m) => m.d.includes('"drive"')).length`);
      try { sim.close(); } catch { /* gone */ }
    }
    return out;
  } finally {
    // ⚠️ THE BROWSER'S OWN SOCKET KEEPS THE SERVER ALIVE — park it, then drop everything.
    await b.call('Page.navigate', { url: `http://127.0.0.1:${PROXY}/blank` }).catch(() => {});
    for (const p of phones) { try { p.close(); } catch { /* gone */ } }
    proxy.cutAll();
    await sleep(200);
    try { show.lobby.tv && show.lobby.tv.destroy(); } catch { /* already gone */ }
    await show.close();
    await sleep(150);
  }
}

// ---------------------------------------------------------------- F0 · it parses
/**
 * `show-wire` X0d makes this assertion about both pages and it is repeated here for one reason:
 * every arm below navigates to this file, and a syntax error in it serves a cheerful 200 and a
 * blank screen, so the browser arms would measure an empty document and report it as an absence.
 */
{
  const m = SHIPPED.match(/<script>([\s\S]*?)<\/script>/);
  let ok = false, why = 'no inline script found';
  if (m) { try { new Function(m[1]); ok = true; } catch (e) { why = e.message; } }
  t('F0 · the shipped phone page has an inline script and it compiles', ok, ok ? `${m[1].length} bytes` : why);
  t('F0 control · every control still compiles too, so a red arm is the DEFECT and not a typo',
    Object.keys(CONTROLS).every((k) => {
      const c = control(k);
      if (!c.applied) return false;
      try { new Function(c.src.match(/<script>([\s\S]*?)<\/script>/)[1]); return true; } catch { return false; }
    }), `${Object.keys(CONTROLS).length} controls, all applied and all parsing`);
}

const RUN = process.env.RRR_PHONE_CONTROL || '';
if (RUN && !CONTROLS[RUN]) { console.log(`  unknown control "${RUN}" — one of ${Object.keys(CONTROLS).join(', ')}`); process.exit(1); }
const shippedSrc = RUN ? control(RUN).src : SHIPPED;
if (RUN) console.log(`\n  ⚠️  RRR_PHONE_CONTROL=${RUN} — the "shipped" arms below are running the CONTROL page.\n`);

if (!existsSync(CHROME)) {
  skipped('F1-F6 the hands', `no Chromium at ${CHROME}; nothing has dispatched a pointer at this page, so whether the guide's CLEAR survives a frame is UNGATED on this machine`);
} else {
  const proxy = makeProxy({ port: PROXY, target: SHOW });
  await proxy.listen();
  const b = await browser();
  await b.call('Page.enable');
  await b.call('Runtime.enable');
  await b.call('Page.addScriptToEvaluateOnNewDocument', { source: SPY });

  const ship = await arm(b, proxy, shippedSrc, { as: 'guide', through: 'vote' });
  const c1 = await arm(b, proxy, control('p1').src, { as: 'guide', through: 'expedition' });
  const c2 = await arm(b, proxy, control('p2').src, { as: 'guide', through: 'vote' });
  const c4 = await arm(b, proxy, control('p4').src, { as: 'guide', through: 'expedition' });
  const wire = await arm(b, proxy, shippedSrc, { through: 'wire' });
  const c3 = await arm(b, proxy, control('p3').src, { through: 'wire' });
  const run = await arm(b, proxy, shippedSrc, { as: 'runner' });
  const c5 = await arm(b, proxy, control('p5').src, { as: 'runner' });
  const c6 = await arm(b, proxy, control('p6').src, { as: 'runner' });
  b.reap();
  await proxy.close();

  // ------------------------------------------------------------ F1 · the sheet survives the frame
  /**
   * 🚨 **450 `state` FRAMES REACH THE GUIDE'S PHONE IN A NINETY-SECOND EXPEDITION** — one per
   * simulator report at 5 Hz, while every other phone in the room receives only pings. `render()`
   * ran on all of them and `box.innerHTML = …` threw the sheet away every time.
   */
  t('F1 arm · the shipped phone was voted into the guide\'s chair and given a real map to read',
    ship.phase === 'EXPEDITION' && ship.pair.guide === 'p1' && ship.frames > 0 && ship.hadClear
    && !!ship.map && !!ship.map.hunter && ship.map.hunter.n > 0,
    `${ship.frames} state frames in ${ship.stormMs} ms · pair ${JSON.stringify(ship.pair)} · ${ship.map && ship.map.hunter ? ship.map.hunter.n : 0} hunter px on the plan`);

  t('F1 · the guide\'s CLEAR button is the SAME NODE after fifty frames',
    ship.clSame === true, `#cl identity ${ship.clSame ? 'held' : 'LOST'} across ${ship.frames} frames`);

  t('F1b · so is the map canvas, and its backing store is never reallocated',
    ship.mapSame === true && ship.canvasWrites === 0,
    `canvas ${ship.mapSame ? 'held' : 'REPLACED'} · ${ship.canvasWrites} width writes over ${ship.frames} frames`);

  t('F1c · a pointerdown and a pointerup with a frame between them still fire the handler',
    ship.clearClick.length === 1 && ship.clearClick[0].id === 'cl' && ship.call.said === 'CLEAR',
    `click target ${JSON.stringify(ship.clearClick)} · server heard ${JSON.stringify(ship.call.said)}`);

  t('F1d · and the casting ballot takes a straddled tap as reliably as a quiet one',
    ship.ballotQuiet === 8 && ship.ballotStraddled === 8,
    `${ship.ballotQuiet}/8 quiet · ${ship.ballotStraddled}/8 with another player's ballot landing mid-tap`);

  t('F1 control · restore the rebuild and every one of those goes the other way',
    control('p1').applied && c1.frames > 0 && c1.clSame === false && c1.mapSame === false
    && c1.canvasWrites >= c1.frames && !(c1.clearClick.length === 1 && c1.clearClick[0].id === 'cl')
    && c1.call.said !== 'CLEAR' && c1.ballotQuiet === 8 && c1.ballotStraddled === 0,
    `identity ${c1.clSame} · ${c1.canvasWrites} canvas writes over ${c1.frames} frames · click ${JSON.stringify(c1.clearClick)}`
    + ` · server heard ${JSON.stringify(c1.call.said)} · ballot ${c1.ballotQuiet}/8 quiet, ${c1.ballotStraddled}/8 straddled`);

  // ------------------------------------------------------------ F2 · a tap during an outage
  t('F2 arm · the shipped phone reached a real VOTE with a real nomination on the sheet',
    ship.votePhase === 'VOTE' && ship.noms > 0 && ship.hadVote && ship.voteClick.length === 1,
    `${ship.noms} nomination(s) · the tap landed on ${JSON.stringify(ship.voteClick)}`);

  t('F2 · a vote tapped while the phone is off air is HELD and delivered on reconnect',
    ship.sentDuringOutage === 0 && ship.sentAfter.length === 1 && !!ship.tally && ship.tally.p3 === 1,
    `nothing left the phone during the outage · then ${JSON.stringify(ship.sentAfter)} · tally ${JSON.stringify(ship.tally)}`);

  t('F2b · and the phone SAYS the tap is held, in words, while it is off air',
    /held/i.test(ship.bannerDuringOutage || '') && ship.localChoice === true,
    `banner "${(ship.bannerDuringOutage || '').slice(0, 64)}" · own choice shown locally: ${ship.localChoice}`);

  t('F2 control · the old `act` drops it in silence — no message, no banner, no vote',
    control('p2').applied && c2.votePhase === 'VOTE' && c2.noms > 0 && c2.hadVote
    && c2.voteClick.length === 1 && c2.sentDuringOutage === 0 && c2.sentAfter.length === 0
    && !!c2.tally && c2.tally.p3 === 0 && !/held/i.test(c2.bannerDuringOutage || ''),
    `the tap landed on ${JSON.stringify(c2.voteClick)}, sent ${c2.sentAfter.length} · banner "${(c2.bannerDuringOutage || '').slice(0, 40)}" · tally ${JSON.stringify(c2.tally)}`);

  // ------------------------------------------------------------ F3 · the half-open socket
  t('F3 arm · the phone is seated and the server is telling it so four times a second',
    wire.pings >= 3 && wire.before === 'connected',
    `${wire.pings} pings in ${TICK_MS * 4} ms · strip reads "${wire.before}"`);

  t('F3 · a socket that reports OPEN and has gone silent is detected and reconnected',
    wire.retries >= 1 && wire.retryMs != null && wire.retryMs < 6000 && wire.after !== 'connected',
    `downstream muted, TCP still up, no close event · retried after ${wire.retryMs} ms · strip reads "${wire.after}"`);

  t('F3 control · with the watchdog gone the same socket is never noticed at all',
    control('p3').applied && c3.pings >= 3 && c3.before === 'connected'
    && c3.retries === 0 && c3.after === 'connected',
    `${c3.retries} reconnect attempts in ten seconds of total silence · strip still reads "${c3.after}"`);

  // ------------------------------------------------------------ F4 · the guide's map, without hue
  const H = ship.map && ship.map.hunter, Y = ship.map && ship.map.you;
  t('F4 arm · both marks are on the plan and both are unreadable by hue to a deuteranope',
    !!H && !!Y && H.n > 0 && Y.n > 0,
    H && Y ? `hunter ${H.n}px reads ${H.seen} · runner ${Y.n}px reads ${Y.seen} — two olives` : 'NO MARKS ON THE MAP AT ALL');

  t('F4 · each mark carries a word that survives the colour transform',
    !!H && !!Y && H.word > 20 && Y.word > 20,
    H && Y ? `HUNTER ${H.word} label px · YOU ${Y.word} label px, in the deuteranope image` : '—');

  t('F4b · and the shapes differ: the Hunter is a ring with floor showing through, you are filled',
    !!H && !!Y && Math.abs(H.centre - ship.map.floor) < 12 && Y.centre - ship.map.floor > 24
    && Math.abs(H.centre - Y.centre) > 20,
    H && Y ? `floor ${ship.map.floor.toFixed(0)} · hunter centre ${H.centre.toFixed(0)} (rim ${H.rim.toFixed(0)}) · you centre ${Y.centre.toFixed(0)}` : '—');

  const cH = c4.map && c4.map.hunter, cY = c4.map && c4.map.you;
  t('F4 control · the two coloured dots carry no word and no shape — the centres are the same',
    control('p4').applied && !!cH && !!cY && cH.n > 0 && cY.n > 0
    && cH.word === 0 && cY.word === 0 && Math.abs(cH.centre - cY.centre) < 20,
    cH && cY ? `${cH.word}/${cY.word} label px · hunter centre ${cH.centre.toFixed(0)} vs you ${cY.centre.toFixed(0)}, floor ${c4.map.floor.toFixed(0)}` : '—');

  // ------------------------------------------------------------ F5 · the leaked timer
  t('F5 arm · the shipped phone was voted runner, the house went live and the stick came up',
    run.pair.runner === 'p1' && run.hadStick && run.drives > 0 && run.afterPhase !== 'EXPEDITION',
    `pair ${JSON.stringify(run.pair)} · ${run.drives} drive messages from the drag · phase after ${run.afterPhase}`);

  t('F5 · not one drive message leaves the phone once the expedition is over',
    run.drivesAfter === 0, `${run.drivesAfter} messages in the three seconds after ${run.afterPhase}`);

  t('F5 control · restore the leak and the radio never stops for the rest of the show',
    control('p5').applied && c5.hadStick && c5.drivesAfter >= 8,
    `${c5.drivesAfter} messages in three seconds after ${c5.afterPhase} — ${(c5.drivesAfter / 3).toFixed(1)}/s, for the remaining ~25 minutes`);

  // ------------------------------------------------------------ F6 · the drive rate
  const rate = (o) => (o.drives / (o.dragMs / 1000));
  t('F6 · a continuous drag is capped at §5\'s 20 Hz level-snapshot rate',
    run.drives > 0 && rate(run) <= 24,
    `${run.drives} messages from 60 pointermoves over ${run.dragMs} ms — ${rate(run).toFixed(0)}/s`);

  t('F6 control · unthrottled, the same drag sends one per touch sample, and the relay forwards all of them',
    control('p6').applied && c6.drives > 0 && rate(c6) > rate(run) * 2 && c6.relayed >= c6.drives,
    `${c6.drives} messages over ${c6.dragMs} ms — ${rate(c6).toFixed(0)}/s, ${c6.relayed} relayed to the simulator · a 120 Hz screen doubles it again`);
}

console.log(`\n  ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}\n`);
process.exit(fail ? 1 : 0);
