/**
 * Browser client for the local party room. Not the survival NetClient — different wire,
 * different filter. Every inbound `state` / `event` has already been projected for THIS socket.
 */

import { CODE_ABC, normalizeCodeDisplay, normalizeCodeWire } from './look.js';
import { STUB_SHOW_PLAN } from './show.js';

export { CODE_ABC, normalizeCodeDisplay, normalizeCodeWire, STUB_SHOW_PLAN };
export {
  SHOW_BEATS, AFTER_RUN_BEATS, TALK_BEATS, isShowBeat, isTalkBeat, recapAfterMs, nextShowBeat,
  holdMsFor, remainingMs, formatRemain,
  RECAP_HOLD_MS, DEBRIEF_HOLD_MS, RECKONING_HOLD_MS, VOTE_HOLD_MS, EXECUTION_HOLD_MS,
  VERDICT_HOLD_MS,
  LATE_DEBRIEF_MS, EMPTY_RECKONING_EXTEND_CAP,
  REUNION_PLAN, reunionBeatAt, rollCallRevealed,
} from './show.js';

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ABC[Math.floor(rand() * CODE_ABC.length)];
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

export class PartyNightClient {
  constructor({ url, onMessage, onClose } = {}) {
    this.url = url;
    this.onMessage = onMessage || (() => {});
    this.onClose = onClose || (() => {});
    this.ws = null;
    this.welcome = null;
    this.events = [];
    /**
     * Sequence numbers this socket was CAUGHT UP with rather than told live. A reconnecting phone
     * is replayed its own role card, and a deal animation on a reconnect would announce a moment
     * that already happened — the card is simply there. Kept beside the log rather than stamped
     * onto the event, because the event is the server's object and gates read its shape.
     */
    this.replayed = new Set();
    this.frame = null;
    this.lobby = null;
    this.ballots = [];
    this.beat = 'lobby';
    /** SMASHED/TIME from the server show message. */
    this.runEnd = null;
    /** Epoch ms — server deadline for the current show beat. Clients tick locally. */
    this.showUntil = null;
    /** Standing nominations, public. */
    this.noms = [];
    /** How many of the room have tapped READY, and how many it takes. Counts only, never names. */
    this.ready = null;
    /** How full the lynch ballot box is. A count and a threshold, never a name. */
    this.tally = null;
    /** Public pairing: who reached out to whom, and who is now one name. Never the words. */
    this.links = { pending: [], pairs: [], used: [] };
    /** Reaction taps, newest last. `onAir()` in react.js decides what is still on screen. */
    this.reacts = [];
    /**
     * 🏁 The Showrunner's aired verdict — `{status, camerasLit, need, episode}` and nothing else.
     *
     * 🚨 **THERE IS NO `fed` ON THIS AND THERE MUST NEVER BE ONE.** `foldWin` returns the feed
     * count right beside `camerasLit`, and `rrr-social-round.md` §4 holds it back until the
     * Reunion: the camera gauge is a deliberately lossy proxy, and evil losing a partner looks
     * exactly like evil winning. The server does not send it (`FANOUT_KEYS.verdict`); this is
     * the client half of the same promise, and `party-night` N17h0b is the control arm.
     *
     * It is NOT cleared on a beat change — the plate has to survive a TV refresh mid-Verdict —
     * and the next episode's Verdict simply overwrites it.
     */
    this.verdict = null;
    /** The season's final status, once the night is over. Null every episode that is RENEWED. */
    this.season = null;
    /**
     * 🎭 **THE REVEAL — roll call, awards, the decisive episode, the unmixed chat.**
     *
     * Null until the server sends it, and the server sends it exactly once, inside
     * `enterReunionLive`. **Do not default this to an empty shape.** A `{seats: []}` default reads
     * as "the Reunion says nobody was anybody", and every view that draws it would then be
     * correct-looking and wrong; `null` means "not yet" and forces the caller to say so.
     */
    this.reveal = null;
    /** Aired lynch ballots — empty until tallied. */
    /** What the server says I voted. Null until it answers. */
    this.myBallot = null;
    this.lynchVotes = [];
    this.lynchResult = null;
    this.connected = false;
    this.full = false;
  }

  /**
   * 🌍 **THE ONE ANSWER TO "WHICH HOUSE IS TONIGHT", AND THE ONLY PLACE ANYTHING MAY ASK.**
   *
   * `null` until the socket actually knows — and callers **must** treat `null` as "not yet",
   * never as a seed. `src/party/mansion.js` derives the whole floor plan from this number and its
   * header says the TV and the phones must not be able to disagree; a `?? 0` at any call site is
   * that disagreement, written as a default.
   *
   * 🚨 IT READS THE WELCOME AS WELL AS THE FRAME, AND THAT ORDER IS THE FIX. `connect()` resolves
   * on `welcome`, and `views/party-host.js` paints on every message — so the first paint runs with
   * `frame` still null. That paint mounts the night-long mansion slot, whose `src` is assigned
   * exactly once, so a wrong seed there is wrong for the whole night. The frame is preferred
   * because it is the durable channel; the welcome is what makes the first paint correct.
   */
  get worldSeed() {
    for (const v of [this.frame?.worldSeed, this.welcome?.worldSeed]) {
      const n = Number(v);
      if (Number.isFinite(n)) return n | 0;
    }
    return null;
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
        if (m.t === 'event') {
          this.events.push(m.ev);
          if (m.replay && m.ev?.seq != null) this.replayed.add(m.ev.seq);
        }
        if (m.t === 'lobby') this.lobby = m;
        if (m.t === 'ballots') this.ballots = m.votes || [];
        if (m.t === 'show') {
          /*
           * ✋ **CLEAR THE READY TALLY ON A BEAT *CHANGE*, NOT ON EVERY `show` MESSAGE.** The
           * server sends `show` more than once per beat — `setShow` fans the beat, then
           * `scheduleShowProgress` fans it again carrying `until`. The first version of this
           * nulled `ready` on both, so the tally the server had just sent was wiped a few
           * milliseconds later by the deadline broadcast, the phone never learned the threshold,
           * and `readyHtml` drew NOTHING. A Debrief with no READY button on it can only run its
           * full five minutes. Found by driving a real phone; no gate saw it.
           */
          if (m.beat !== this.beat) {
            this.ready = null; this.tally = null;
            this.links = { pending: [], pairs: [], used: [] };
            // Reactions belong to the run they were fired during — they do not follow it out.
            this.reacts = [];
          }
          this.beat = m.beat;
          this.runEnd = m.end || null;
          this.showUntil = Number.isFinite(m.until) ? m.until : null;
        }
        if (m.t === 'noms') this.noms = m.standing || [];
        /* The voter's own receipt — what the server actually recorded, which is not always what
           was tapped (a self-pick is coerced to NO ONE). One socket only. */
        if (m.t === 'ballotOk') this.myBallot = { ok: m.ok !== false, choice: m.choice, why: m.why || '' };
        if (m.t === 'show') this.myBallot = null;
        if (m.t === 'ready') this.ready = { count: m.count | 0, need: m.need | 0 };
        if (m.t === 'tally') this.tally = { in: m['in'] | 0, living: m.living | 0, need: m.need | 0 };
        /*
         * 👏 A reaction is an EVENT, not a stored fact — so it is appended, and `onAir()` decides
         * what is still on screen by wall clock. The list is TRIMMED here rather than left to
         * grow: a sixty-second run at a full table is a few hundred taps, and a TV tab that
         * stays open across an eight-episode night would otherwise hold every one of them.
         */
        if (m.t === 'react' && typeof m.from === 'string') {
          this.reacts.push({ from: m.from, r: m.r, at: Number(m.at) || Date.now() });
          if (this.reacts.length > 64) this.reacts.splice(0, this.reacts.length - 64);
        }
        /*
         * 🍮 Who is paired, and what they are called now. PUBLIC — every socket gets this, the
         * TV included, because the room watching a pair form is the point. The WORDS arrive as
         * `t:'whisper'` on two sockets only and are never stored here; the phone keeps them in
         * its own closure so nothing on the shared client object can leak them to another view.
         */
        if (m.t === 'links') this.links = { pending: m.pending || [], pairs: m.pairs || [], used: m.used || [] };
        if (m.t === 'verdict') {
          this.verdict = {
            status: m.status, camerasLit: m.camerasLit | 0,
            need: Number.isFinite(m.need) ? m.need | 0 : null,
            episode: m.episode | 0,
          };
        }
        if (m.t === 'season') this.season = m.status || null;
        if (m.t === 'reveal') {
          this.reveal = {
            seats: m.seats || [], awards: m.awards || [],
            decisive: m.decisive || null, chat: m.chat || [],
          };
        }
        if (m.t === 'lynch') {
          this.lynchVotes = m.votes || [];
          this.lynchResult = m.result || null;
        }
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
