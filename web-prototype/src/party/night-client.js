/**
 * Browser client for the local party room. Not the survival NetClient — different wire,
 * different filter. Every inbound `state` / `event` has already been projected for THIS socket.
 */

export function makeCode(rand = Math.random) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(rand() * abc.length)];
  return s;
}

export function defaultWsUrl(port = 5181) {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (q.get('ws')) return q.get('ws');
  const host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'localhost';
  const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
  return `${proto}//${host}:${port}`;
}

/** Per-seat storage. Host and phone must not share a token for the same room. */
export function tokenKey(code, kind = 'phone') {
  const seat = (kind === 'tv' || kind === 'host') ? 'tv' : 'phone';
  return `rrr.party.${String(code || '').toLowerCase()}.${seat}.token`;
}

/** After Send them in: reveal stays up, then the stub run, then recap. No extra host click. */
export const STUB_SHOW_PLAN = [
  { beat: 'expedition', ms: 1800 },
  { beat: 'recap', ms: 4800 },
];

export class PartyNightClient {
  constructor({ url, onMessage, onClose } = {}) {
    this.url = url;
    this.onMessage = onMessage || (() => {});
    this.onClose = onClose || (() => {});
    this.ws = null;
    this.welcome = null;
    this.events = [];
    this.frame = null;
    this.lobby = null;
    this.ballots = [];
    this.beat = 'lobby';
    this.connected = false;
    this.full = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('room server did not answer — npm run party:local')), 4000);
      ws.onopen = () => { this.connected = true; };
      ws.onerror = () => { if (!this.welcome && !this.full) reject(new Error('cannot reach the room server — npm run party:local')); };
      ws.onclose = () => { this.connected = false; this.onClose(); };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') this.welcome = m;
        if (m.t === 'full') this.full = true;
        if (m.t === 'state') this.frame = m.frame;
        if (m.t === 'event') this.events.push(m.ev);
        if (m.t === 'lobby') this.lobby = m;
        if (m.t === 'ballots') this.ballots = m.votes || [];
        if (m.t === 'show') this.beat = m.beat;
        this.onMessage(m);
        if (m.t === 'welcome' || m.t === 'full') {
          clearTimeout(timer);
          resolve(this);
        }
      };
    });
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close() { this.ws?.close(); }
}
