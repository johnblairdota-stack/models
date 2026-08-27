const WS = 5181;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(code, wantTV) {
  return new Promise((resolve, reject) => {
    const q = wantTV ? `room=${code}&seat=tv` : `room=${code}`;
    const ws = new WebSocket(`ws://127.0.0.1:${WS}/?${q}`);
    const box = { ws, msgs: [], playerId: null };
    ws.onmessage = (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
      box.msgs.push(m);
      if (m.t === 'welcome') { box.playerId = m.playerId; resolve(box); }
      if (m.t === 'full') reject(new Error('full'));
    };
    ws.onerror = () => reject(new Error('ws error'));
    setTimeout(() => reject(new Error('welcome timeout')), 5000);
  });
}
const send = (box, o) => box.ws.send(JSON.stringify(o));
const closeAll = (...boxes) => { for (const b of boxes.flat()) try { b.ws.close(); } catch {} };
async function emptySmoke(N) {
  const CODE = 'e' + N + Math.random().toString(36).slice(2, 5);
  const tv = await open(CODE, true);
  const phones = [];
  for (let i = 0; i < N; i++) {
    const p = await open(CODE, false);
    send(p, { t: 'name', name: 'P' + (i + 1) });
    send(p, { t: 'look', shell: '#d4a574', accent: '#c45c26' });
    phones.push(p);
  }
  await sleep(200);
  send(tv, { t: 'start' });
  send(tv, { t: 'casting' });
  await sleep(200);
  send(tv, { t: 'episode', opts: {} });
  await sleep(350);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const pair = last?.frame?.pair || null;
  const pass = !pair?.runner;
  const row = { id: `N${N}-empty-noop`, N, pair, phase: last?.frame?.phase, pass };
  console.log(JSON.stringify(row));
  closeAll(tv, phones);
  return row;
}
const out = [];
out.push(await emptySmoke(4));
out.push(await emptySmoke(5));
const fails = out.filter((r) => !r.pass).length;
console.log('EMPTY_SMOKE_N4_N5', { pass: out.length - fails, fail: fails, total: out.length });
process.exit(fails ? 1 : 0);
