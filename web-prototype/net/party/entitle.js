/**
 * THE ENTITLEMENT MATRIX — one declarative table of who may be told what.
 *
 * `net/server.mjs` L18-19 already refuses to replicate `StageHealth` *"because it would leak how
 * close a wall is to opening"*. That is this discipline, already applied to a much smaller
 * secret. This file is the same idea made total and made data.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 DENY BY DEFAULT. A FIELD PATH WITH NO ROW IS A VIOLATION, NOT A PASS.
 * ---------------------------------------------------------------------------------------------
 * The alternative — an explicit deny-list — loses the moment anybody adds a field, which is the
 * failure mode that ends this game silently in someone's lounge with no error thrown. With
 * deny-by-default, a field added six months from now fails `party-isolation` I1 until its author
 * writes a row and states its audience out loud. **The rot is the point.**
 *
 * ⚠️ THE TABLE IS SHARED WITH THE GATE. THE PROJECTION IS NOT, AND MUST NEVER BE.
 * `harness/party-isolation.mjs` reads `MATRIX` and walks observed transcripts against it with its
 * own independent walker. If the gate reused `project()` below, a bug in the filter would pass
 * its own gate — which is how sixteen instruments on this project produced result-shaped output
 * instead of an error (`_limb1-rule.mjs` L27-34).
 *
 * No THREE, no DOM. Bare node and browser both.
 */

/**
 * Audiences.
 *   self    the socket whose player it is, nobody else
 *   evil    Production sockets only
 *   guide   this episode's guide only        runner  this episode's runner only
 *   crew    runner or guide                  tv      the host screen only
 *   all     every connected socket
 */
export const AUDIENCE = ['self', 'evil', 'guide', 'runner', 'crew', 'tv', 'all'];

/**
 * `[pathGlob, audience]`. `[]` marks an array hop; `*` matches one segment.
 *
 * 🚨 THE ABSENT ROWS ARE THE DESIGN, AND THEY ARE LISTED IN THE COMMENTS SO A READER SEES THE
 * REFUSAL RATHER THAN AN OMISSION. `players[].alignment` has no row and never will before the
 * Reunion — that is bible P6, silent death, expressed as an absence rather than a promise.
 */
export const MATRIX = [
  // ---- the frame envelope
  ['phase',                    'all'],
  ['tick',                     'all'],
  ['episode',                  'all'],
  ['worldSeed',                'all'],   // public exactly as today (run.js L43-48)
  // 'castSeed'                          NO ROW. See src/party/cast.js's header.

  // ---- the shooting clock. The countdown on the television and the one on every phone are the
  // same number, sent rather than each side running its own timer — two clocks drift, and a phone
  // that thinks the vote is still open when it has closed eats somebody's vote.
  ['clock.seconds',            'all'],
  ['clock.endsAt',             'all'],

  // ---- you
  ['you.id',                   'self'],
  ['you.seat',                 'self'],
  ['you.role',                 'self'],
  // 🚨 THE CARD'S OWN WORDS, AND THEY ARE `self` FOR THE SAME REASON THE KEY IS. `you.role` is an
  // object key — `focusPuller` — and the phone printed it raw, while `roles.js`'s SCRIPT has
  // carried a display name and a one-line ability for every card since it was written and was
  // imported once in the whole tree, unused. These two rows are what put them on the card.
  // A line reading *"each episode, learn whether the Hunter noticed the runner by sight or by
  // sound"* names a role as surely as the key does, so it is nobody else's, ever.
  ['you.roleName',             'self'],
  ['you.roleLine',             'self'],
  ['you.alignment',            'self'],
  ['you.teammates[].id',       'evil'],
  ['you.teammates[].role',     'evil'],
  ['you.teammates[].claimDraft', 'evil'],   // the Production Panel, and the ONLY draft on any wire
  ['you.acted',                'self'],    // has THIS phone tapped yet this phase — never anyone else's

  // ---- the room
  ['players[].id',             'all'],
  ['players[].seat',           'all'],
  ['players[].name',           'all'],
  ['players[].alive',          'all'],
  ['players[].claim',          'all'],   // PUBLISHED claims only
  ['players[].plate',          'all'],   // undeclared/drafting/published/face-down. Never the role.
  // 🚨 HOW SOMEBODY LEFT IS PUBLIC; WHAT THEY WERE IS NOT. `player.taken` and `player.executed`
  // are both PUBLIC events already, so withholding the flag here would hide nothing and would
  // only stop the circle drawing a hunter mark instead of a sledgehammer. This field was written
  // by `applyTake` and silently dropped by deny-by-default for as long as it has existed —
  // caught by `session.js` reporting `unrowed` rather than discarding it like `room.js` did.
  // §2's refusal is *"public, attributed, permanent"* in its own words, so the flag is `all` and
  // is on every row from frame one — a field that appears the moment somebody uses their
  // once-per-game move has announced it a second time, in shape.
  ['players[].refused',        'all'],
  ['players[].taken',          'all'],
  // 'players[].alignment'               NO ROW. Nobody, ever, pre-REUNION.
  // 'players[].role'                    NO ROW. Ditto.
  // 'players[].claimDraft'              NO ROW. Drafts are evil-only, under you.teammates[].

  // ---- the episode
  ['pair.runner',              'all'],
  ['pair.guide',               'all'],
  ['cameras.unlocked',         'all'],
  ['cameras.needed',           'all'],
  // The wing is announced BEFORE anyone is cast (rrr-social-round.md §2), so casting is an
  // argument about a specific job rather than a popularity contest.
  ['expedition.room',          'all'],
  ['expedition.outcome',       'all'],
  // Is a mansion attached? The runner's phone shows a throttle when there is one and GO/WAIT
  // when there is not, so it has to be told — and the whole table may know which it is playing.
  ['expedition.live',          'all'],
  // 🚨 THE GUIDE'S CALL IS SPOKEN, NEVER PRINTED — broadcast §6.9, in its own words: *"Never show
  // the runner's private prompts or the guide's callouts as on-screen text. The guide talks out
  // loud, in the room. That is the game."* Both rows here were `all`, and the television printed
  // CLEAR at sixty-eight pixels in the middle of the circle, which is the same sentence the guide
  // was supposed to have to say themselves — and a permanent, unambiguous, re-readable record of
  // it for the DEBRIEF that was supposed to argue about what was said.
  //
  // ⚠️ THE RECORD IS NOT AFFECTED AND THAT IS THE POINT. `call.made` is still a PUBLIC log event
  // carrying `by` and `said`, so the Reunion, the Director and every query over the log see the
  // call in full. What comes off is the FRAME — the thing that becomes on-screen text.
  //
  // `call.by` has no row at all: it is `pair.guide`, which is already public, so the only thing
  // it ever added to a frame was a second name to print.
  ['call.made',                'all'],    // that the guide has spoken. The clock, not the callout
  ['call.said',                'guide'],  // and their own controller says it back to them alone

  // ---- the reckoning and the ballot
  ['nominations[].nominator',  'all'],
  ['nominations[].target',     'all'],
  // §4: the vote record is AIRED, attributed. It is only ever set after the phase closes — see
  // `session.js`'s `vote` input, which holds it back so the last voter is not decisive.
  ['tally.counts.*',           'all'],
  ['tally.threshold',          'all'],
  ['tally.executed',           'all'],

  // ---- the guide's map. party-loop.md puts this under "Do not" in its own words.
  ['flyover.marks[].x',        'guide'],
  ['flyover.marks[].z',        'guide'],
  ['flyover.marks[].kind',     'guide'],
  ['flyover.hunter',           'guide'],
  ['flyover.room',             'guide'],   // named only when actually seen; null otherwise
  // The floor plan the marks are drawn on. `guide` rather than `all` — see houseplan.js's header:
  // the outline is not a secret, but an `all` row is a minimap one CSS rule from the television.
  ['flyover.plan[].id',        'guide'],
  ['flyover.plan[].x0',        'guide'],
  ['flyover.plan[].x1',        'guide'],
  ['flyover.plan[].z0',        'guide'],
  ['flyover.plan[].z1',        'guide'],

  // ---- incidents. A count, never a list (party-anon A4).
  ['incident.alarms',          'all'],
  // 'incident.by'                       NO ROW. T5.

  // ---- failure events. Closed schema, and src/party/events.js owns the allow-list.
  ['failure.kind',             'all'],
  ['failure.room',             'all'],
  ['failure.phaseTick',        'all'],
  ['failure.loudness',         'all'],
];

const compiled = MATRIX.map(([glob, aud]) => [
  new RegExp('^' + glob
    .replace(/[.]/g, '\\.')
    .replace(/\[\]/g, '\\[\\]')
    .replace(/\*/g, '[^.]+') + '$'),
  aud,
]);

/** The audience for a normalised key path, or `null` if the table has no row. */
export function audienceFor(path) {
  for (const [re, aud] of compiled) if (re.test(path)) return aud;
  return null;
}

/**
 * Every leaf key path in an object, arrays normalised to `[]`.
 * A leaf is a non-object; an EMPTY object or array is itself a leaf, because an empty
 * `teammates: []` is a fact about alignment and must be visible to the walker.
 */
export function keyPaths(obj, prefix = '', out = []) {
  if (obj === null || typeof obj !== 'object') { out.push(prefix); return out; }
  if (Array.isArray(obj)) {
    if (obj.length === 0) { out.push(prefix + '[]'); return out; }
    for (const v of obj) keyPaths(v, prefix + '[]', out);
    return out;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) { out.push(prefix); return out; }
  for (const k of keys) keyPaths(obj[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/**
 * Does `ctx` satisfy `aud`?
 * @param {{playerId:string, alignment:string, isTV:boolean, seatRole:('runner'|'guide'|null), ownerId:string|null}} ctx
 */
export function entitled(aud, ctx) {
  switch (aud) {
    case 'all':    return true;
    case 'tv':     return ctx.isTV;
    case 'self':   return !ctx.isTV && (ctx.ownerId == null || ctx.ownerId === ctx.playerId);
    case 'evil':   return !ctx.isTV && ctx.alignment === 'evil';
    case 'guide':  return !ctx.isTV && ctx.seatRole === 'guide';
    case 'runner': return !ctx.isTV && ctx.seatRole === 'runner';
    case 'crew':   return !ctx.isTV && (ctx.seatRole === 'guide' || ctx.seatRole === 'runner');
    default:       return false;
  }
}

/**
 * Project a full frame down to what one socket may see. Deny-by-default: a path with no row is
 * dropped AND reported, so an unrowed field is caught in development rather than shipped.
 *
 * 🚨 A FILTERED-EMPTY CONTAINER IS DELETED, NOT LEFT BEHIND, AND THIS IS NOT TIDINESS.
 * The first draft of this function dropped the scalars and kept the husks, so a good player's
 * frame carried `you: { teammates: [ {} ] }` — no field, no value, and the array's LENGTH still
 * answering "how many teammates does this evil player have". That is `party-isolation` I4's
 * named failure — *"an evil-only array whose length is visible"* — reproduced by the shipped
 * filter within a minute of it existing. So `prune` runs after the walk and removes any object
 * or array left with nothing in it, recursively, and I4 asserts the result is byte-identical
 * across equally-entitled sockets rather than merely value-free.
 *
 * @returns {{frame:object, unrowed:string[]}}
 */
export function project(full, ctx) {
  const unrowed = [];
  const walk = (node, prefix) => {
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((v) => walk(v, prefix + '[]'));
    const out = {};
    for (const k of Object.keys(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const v = node[k];
      if (v !== null && typeof v === 'object') { out[k] = walk(v, path); continue; }
      const aud = audienceFor(path);
      if (aud === null) { unrowed.push(path); continue; }
      if (entitled(aud, ctx)) out[k] = v;
    }
    return out;
  };
  return { frame: prune(walk(full, '')), unrowed };
}

/** Recursively delete objects and arrays that filtering emptied. See `project`'s header. */
function prune(node) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    const kept = node.map(prune).filter((v) => v !== undefined);
    return kept.length ? kept : undefined;
  }
  const out = {};
  for (const k of Object.keys(node)) {
    const v = prune(node[k]);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
