/**
 * 📼 **THE LOG — one append-only stream, and `vis` is the only thing that reads it.**
 *
 * `docs/design/rrr-social-round.md` §4, and the reason the build brief calls this the spine.
 * Three things specced as separate systems are ONE mechanism here:
 *
 *     the per-socket filter  =  this stream with `vis` applied
 *     THE REUNION            =  THE SAME REPLAY WITH THE FILTER OFF
 *     `party-isolation`      =  the same rule, asserted against what a socket actually got
 *
 * The saving is not code size. It is that **a leak and a missing Reunion reveal become the same
 * bug, found by the same gate.** A design where those are two systems is a design where one of
 * them is quietly wrong for a month.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE HASH IS ISOMORPHIC ON PURPOSE — NO `node:crypto`.
 * ---------------------------------------------------------------------------------------------
 * This module runs in a browser, in bare node and in a Cloudflare worker, so it cannot reach for
 * a node builtin. FNV-1a over the canonical JSON of each entry, chained into the previous hash.
 * It is not a security primitive and is not pretending to be one: it exists so `reunion-truth`
 * can prove the stream it replays is the stream that was written, and so a rewritten history
 * fails a gate rather than telling a nicer story at the Reunion.
 *
 * No THREE, no DOM.
 */

import { VIS } from './events.js';

/** FNV-1a, 32-bit, as hex. Deterministic across every runtime this has to live in. */
export function hash32(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Is this entry visible to this context, right now, mid-game?
 *
 * 🚨 `SEALED` IS VISIBLE TO NOBODY, INCLUDING THE TV. The feed count, the deal, and the reason
 * anyone died live here. `DIRECTOR` is the broadcast's own bus and never leaves the host — the
 * Director is forbidden alignment in scope (bible invariant), and this is where that is enforced
 * rather than promised.
 *
 * 🚨 `for` NARROWS, ALWAYS, AND IT IS ORTHOGONAL TO THE CLASS. `party-sockets` S4 caught the
 * first draft handing every evil socket every OTHER evil player's Production Panel, because
 * `EVIL` was read as *"any evil may see this"* rather than *"only evil, and only the addressee"*.
 * In a two-Production game the damage is small — a teammate learns a roster they already have —
 * and that is exactly why it would have survived a playtest and shipped. At three Production
 * members it hands out a private surface, and an addressed event that ignores its address is a
 * bug waiting for a bigger cast. The class says WHO MAY; `for` says WHO.
 *
 * @param {{vis:string, for?:string, crew?:string[]}} e
 * @param {{playerId:string|null, alignment:string|null, isTV:boolean}} ctx
 */
export function visibleTo(e, ctx) {
  if (e.for != null && e.for !== ctx.playerId) return false;
  // 🚨 THE STUB PUBLISHES COVERS AS `player.claim_set`. That event is PUBLIC so Reunion and
  // I3b still see a published nameplate, but the TV browser is not a nameplate — DevTools on
  // the host tab would read every cover (cover==role except Glitched). The Reunion still
  // reads the log. Phones still receive the public event.
  if (e.type === 'player.claim_set' && ctx.isTV) return false;
  switch (e.vis) {
    case VIS.PUBLIC:   return true;
    case VIS.DIRECTOR: return !!ctx.isTV;
    case VIS.EVIL:     return !ctx.isTV && ctx.alignment === 'evil';
    case VIS.CREW:     return !ctx.isTV && Array.isArray(e.crew) && e.crew.includes(ctx.playerId);
    case VIS.SELF:     return !ctx.isTV && e.for === ctx.playerId;
    case VIS.SEALED:   return false;
    default:           return false;   // deny by default, same as the entitlement matrix
  }
}

/** An append-only log. `head()` is the chain hash of everything written so far. */
export function createLog() {
  const entries = [];
  let head = '00000000';

  return {
    /** Append and return the stored entry, stamped with its sequence number and chain hash. */
    append(e) {
      const seq = entries.length;
      const body = JSON.stringify({ seq, type: e.type, vis: e.vis, data: e.data ?? {}, for: e.for, crew: e.crew });
      head = hash32(head + body);
      const stored = { ...e, seq, h: head };
      entries.push(stored);
      return stored;
    },

    /** Everything, in order. Ground truth — belongs to the host and the gates, never a socket. */
    all: () => entries.slice(),

    /** What one socket may replay mid-game. This is the live filter. */
    replayFor: (ctx) => entries.filter((e) => visibleTo(e, ctx)),

    /**
     * 🚨 THE REUNION IS THE SAME REPLAY WITH THE FILTER OFF. Not a second pipeline, not a
     * separate reveal payload assembled by hand — the identical stream, unfiltered. That is why
     * `party-log` can assert the Reunion is complete by asserting it equals `all()`.
     */
    reunion: () => entries.slice(),

    head: () => head,

    /** Recompute the chain from scratch. A rewritten entry moves this away from `head()`. */
    verify() {
      let h = '00000000';
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const body = JSON.stringify({ seq: e.seq, type: e.type, vis: e.vis, data: e.data ?? {}, for: e.for, crew: e.crew });
        h = hash32(h + body);
        if (e.h !== h) return { ok: false, at: i, type: e.type };
      }
      return { ok: h === head, at: -1 };
    },
  };
}
