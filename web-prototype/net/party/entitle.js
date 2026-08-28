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
export const AUDIENCE = ['self', 'evil', 'guide', 'runner', 'crew', 'tv', 'phones', 'all'];

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
  ['airingEpisode',            'all'],   // episode on the air; see room.js playEpisode
  ['worldSeed',                'all'],   // public exactly as today (run.js L43-48)
  // 'castSeed'                          NO ROW. See src/party/cast.js's header.

  // ---- you
  ['you.id',                   'self'],
  ['you.seat',                 'self'],
  ['you.role',                 'self'],
  ['you.alignment',            'self'],
  ['you.teammates[].id',       'evil'],
  ['you.teammates[].role',     'evil'],
  ['you.teammates[].claimDraft', 'evil'],   // the Production Panel, and the ONLY draft on any wire

  /*
   * ---- what this player has been told about where the bodies are.
   *
   * 🚨 EVERY ROW IS `self`, AND THAT IS NOT THE SAME AS SAYING EVERY PLAYER GETS THE SAME THING.
   * The asymmetry John asked for — *"Evil can see exactly where the runner and the hunter are at
   * the same time"* against *"Good players get sporadic/vague information"* — is computed in
   * `src/party/intel.js` and applied in `src/party/room.js` BEFORE this table ever runs. A good
   * player's `you.intel` genuinely has no `at` key on it; it is not an exact value hidden behind a
   * row they lack.
   *
   * That ordering is deliberate. An `evil`-audience row on `you.intel.hunter.at` would work too,
   * and would be worse: the coarse read and the exact read would then be the SAME object with one
   * field filtered, so the moment anybody added a second exact field and forgot its row, the good
   * player would receive it. Coarsening at the source cannot fail that way.
   *
   * `you.*` is never sent to the TV (`fullFor` gives a TV socket no `you` at all, and `role-peek`
   * W4 asserts it), so none of this can reach the shared screen.
   */
  ['you.intel.hunter.room',    'self'],
  ['you.intel.hunter.at',      'self'],
  ['you.intel.runner.room',    'self'],
  ['you.intel.runner.at',      'self'],
  ['you.intel.grade',          'self'],
  ['you.intel.age',            'self'],

  /*
   * ---- where THIS phone's body is standing right now.
   *
   * Not intel. Not the map. Not Word from the House. A person in a room knows which room
   * they are in; the runner pad saying that one word makes the guide's shouted room name
   * checkable. Audience is runner — seated phones and the TV never see it.
   */
  ['you.here',                 'runner'],

  // ---- the room
  ['players[].id',             'all'],
  ['players[].seat',           'all'],
  ['players[].name',           'all'],
  ['players[].alive',          'all'],
  ['players[].shell',          'all'],   // lobby cosmetic. Public. Not a role.
  ['players[].accent',         'all'],   // lobby cosmetic. Public. Not a role.
  // 'players[].hunter'                  NO ROW. Cosmetics are not a hole for a later secret.
  // 'players[].deal'                    NO ROW. Ditto.
  ['players[].claim',          'phones'], // published nameplates. Never the TV — see log.js `player.claim_set`.
  ['players[].plate',          'all'],   // undeclared/drafting/published/face-down. Never the role.
  // 'players[].alignment'               NO ROW. Nobody, ever, pre-REUNION.
  // 'players[].role'                    NO ROW. Ditto.
  // 'players[].claimDraft'              NO ROW. Drafts are evil-only, under you.teammates[].

  // ---- the episode
  ['pair.runner',              'all'],
  ['pair.guide',               'all'],
  ['cameras.unlocked',         'all'],
  ['cameras.needed',           'all'],

  // ---- the guide's map. party-loop.md puts this under "Do not" in its own words.
  ['flyover.marks[].x',        'guide'],
  ['flyover.marks[].z',        'guide'],
  ['flyover.marks[].kind',     'guide'],
  ['flyover.hunter',           'guide'],
  // Is the good guide's feed currently eaten by static? `src/party/mapfeed.js`. A boolean about
  // the CHANNEL, never about the hunter — a jammed frame carries no hunter mark to describe.
  ['flyover.jam',              'guide'],

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
    case 'phones': return !ctx.isTV;
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
