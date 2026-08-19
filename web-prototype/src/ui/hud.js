/**
 * THE HUD IS THE BODY.
 *
 * There is no health bar because there is no health, and no inventory panel because the
 * inventory is what is bolted to you. So the entire readout is a four-socket schematic:
 * which sockets are full, what is in them, and what is in your fist. Nothing else — this
 * is a horror game, and a screen full of meters is the fastest way to make a dark house
 * feel safe.
 *
 * Rules it follows:
 *   · nothing animates unless the body changed. A HUD that is always moving is noise.
 *   · a fitted gadget is drawn as its own mark, not as a text label.
 *   · the prompt line appears only when an action is actually available.
 *
 * LOSING A LIMB IS THE LOUDEST THING THIS FILE DOES, and that is a deliberate reversal.
 * The original rule here was "a socket going empty flashes ONCE and the absence is the
 * information". Measured in play, that flash was one decay of `dt * 0.85` on a 104 px widget
 * in the darkest corner of the frame — a play-critic lost four limbs in nine seconds and only
 * found out from the console. The absence is only information if you noticed the subtraction.
 * So a limb coming off now costs the WHOLE FRAME for two seconds, in five layers:
 *
 *   1. the frame takes the hit   a hard white-hot rim for ~70 ms, collapsing into a deep
 *                                warning red that pulses three times over 2.2 s
 *   2. it says which side        the rim is biased toward the socket that emptied — left arm
 *                                lights the left edge, both legs light the bottom
 *   3. it says what happened     one large letterspaced line above the crosshair,
 *                                "LEFT ARM TORN OFF", held 1.0 s then faded
 *   4. the rosette answers       the schematic punches to 1.18x and drops back, and the lost
 *                                node's ring and torn spurs stay hot for the full 2.4 s
 *   5. the camera takes it       (player.js — `Player.shock`, read by ThirdPersonCamera)
 *
 * The centre of the screen stays clear through all of it. A feedback layer that hides the
 * thing that just hurt you is worse than no feedback: the peak alpha lives at the edges.
 *
 * THREAT is the other channel. `setThreat(v)` drives a slow dark-red breathing at the very
 * edge of the frame, scaled by how aware the hunter is and how close it is. It carries
 * intensity and nothing else — no direction, no distance readout — because the job is
 * "something is coming", not "the hunter is 7.4 m to your left".
 *
 * DOM, not canvas: it costs no draw calls, it stays sharp at any resolution, and it cannot
 * fight the post stack for the frame budget.
 */

const NS = 'http://www.w3.org/2000/svg';

// schematic coordinates, in the SVG's own 100x120 space
const NODES = {
  shoulderL: { x: 24, y: 40 }, shoulderR: { x: 76, y: 40 },
  hipL: { x: 36, y: 82 }, hipR: { x: 64, y: 82 },
};

/** Where on screen a wound to this socket should light up. x/y in percent. */
const WOUND_AT = {
  shoulderL: { x: 16, y: 46, name: 'LEFT ARM' },
  shoulderR: { x: 84, y: 46, name: 'RIGHT ARM' },
  hipL: { x: 30, y: 84, name: 'LEFT LEG' },
  hipR: { x: 70, y: 84, name: 'RIGHT LEG' },
};

const GADGET_MARK = {
  nailgun: 'M -6 0 L 6 0 M 3 -3 L 6 0 L 3 3',       // a bolt
  oil: 'M 0 -5 C 5 0 4 5 0 5 C -4 5 -5 0 0 -5',      // a drop
  grapple: 'M -5 -4 L 0 3 L 5 -4 M 0 3 L 0 6',       // a hook
  ball: 'M 0 0 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0',
  skates: 'M -6 3 L 6 3 M -4 -2 L 4 -2',
};

const WEAPON_LABEL = {
  fist: 'FIST', limbClub: 'CLUB', nailgun: 'NAILGUN',
  oil: 'OIL', grapple: 'GRAPPLE', ball: 'BALL', skates: 'SKATES',
  sledge: 'SLEDGEHAMMER',
};

/** Total life of a wound event, seconds. Three pulses fit inside it. */
const WOUND_DUR = 2.2;

/**
 * THE CALLOUT IS ONE SLOT AND THREE THINGS WANT IT. See `say()`.
 *
 * `setPlace` (a room caption), `denyAttack` (a dead trigger) and the wound line all wrote the
 * same variable, last writer wins. Measured in live play: walking through a doorway while a
 * limb came off cut "RIGHT ARM TORN OFF" at 1.0 s of its designed 1.9 s hold, and a multi-hit
 * kill smeared four limb losses into one unreadable flicker because each new line replaced the
 * last on the frame it arrived.
 *
 * So messages carry a RANK and the slot arbitrates:
 *   PLACE  a caption. Yields to everything, and waits its turn.
 *   DENY   the trigger did nothing. Outranks a caption.
 *   WOUND  a limb came off, or you died. Outranks everything.
 * A higher rank takes the slot immediately and DEFERS what it interrupted (restored afterwards
 * with whatever time it had left, or dropped if that is too short to read). A lower rank waits.
 * Equal ranks — the multi-hit case — take turns: the incoming line waits until the one on
 * screen has had `MIN_HOLD` to be read, so four limbs coming off read as four events.
 */
/**
 * ⚠️ `alarm` IS 2.5 ON PURPOSE AND IT IS NOT A TYPO. Rank is ordinal — `say()` only ever
 * compares ranks with `>` and `===` — so a value between DENY and WOUND is exactly as valid as
 * an integer, and inserting one costs nothing. Renumbering the scale to make room WOULD cost
 * something: `_msgState()` returns the raw number and existing probes assert on it
 * (`diag-fair.mjs`'s `hud` part checks `rank === 3` for a wound), so a renumber would silently
 * re-point three assertions at the wrong thing. The alarm must outrank a room caption and a
 * dead trigger, and must never cut short the line that says a limb came off.
 */
const RANK = { place: 1, deny: 2, alarm: 2.5, wound: 3 };
/** Seconds a message is guaranteed on screen before an equal-ranked one may take the slot. */
const MIN_HOLD = 0.62;
/** A deferred message with less than this left is not worth restoring — it would only blink. */
const MIN_RESTORE = 0.75;
/** Deferred messages, total. A backlog longer than this is noise, not information. */
const QUEUE_MAX = 3;

export function createHUD(o = {}) {
  const rig = o.rig;
  // THE SLEDGEHAMMER IS NOT IN ANY SOCKET — task-sledge-pickup.md §3.4. It is a second,
  // independent held-prop system (`player.sledge`, see `sledge.js`'s own header: "sledge and
  // limbs coexist"), so `rig.activeWeapon` has no way to know about it and the readout used to
  // print whatever the fitted gadget or fist was, even with the hammer drawn — "a player
  // cannot tell hammer from fist". `sledge` is optional so every OTHER view that builds a HUD
  // off a bare rig (none of them use the hammer today) is unaffected.
  const sledge = o.sledge ?? null;
  const mount = o.mount ?? document.body;

  const root = document.createElement('div');
  root.className = 'rrr-hud';
  root.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:30;
    font:500 10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.22em;
    color:#8d8478;text-transform:uppercase`;

  // ---- THREAT: the outermost layer, and the quietest. Behind everything else.
  //
  // A RADIAL GRADIENT WITH A TRANSPARENT CORE, not an inset box-shadow, and normal blending,
  // not `screen`. The first attempt at this used `mix-blend-mode:screen` over a 280 px inset
  // shadow and the driven playtest screenshot came back with the ENTIRE frame lifted to a
  // flat amber — a dread layer that brightened the room and buried the contrast the player
  // navigates by. A gradient that is explicitly `transparent` out to 40% of the frame cannot
  // touch the middle of the screen no matter what alpha it is given, which is the property
  // that matters here.
  const threatEl = document.createElement('div');
  threatEl.style.cssText = 'position:absolute;inset:0;opacity:0';
  root.appendChild(threatEl);

  // ---- WOUND: the loudest. Two elements so the hard rim and the directional bias can decay
  // on different curves — a single element cannot be both a 70 ms punch and a 2.2 s throb
  // without one of them reading as a mistake.
  const woundRim = document.createElement('div');
  woundRim.style.cssText = 'position:absolute;inset:0;opacity:0';
  root.appendChild(woundRim);
  const woundBias = document.createElement('div');
  woundBias.style.cssText = 'position:absolute;inset:0;opacity:0';
  root.appendChild(woundBias);

  // ---- body schematic, bottom left. 104 px was too small to carry the game's only damage
  // readout; 148 px still occupies less than 4% of the frame.
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 120');
  svg.style.cssText = `position:absolute;left:38px;bottom:34px;width:148px;height:178px;
    overflow:visible;transform-origin:50% 60%;filter:drop-shadow(0 0 10px rgba(0,0,0,.85))`;
  root.appendChild(svg);

  const mk = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.appendChild(e);
    return e;
  };

  // torso: a bare armature, drawn thin so it reads as a diagram and not as an avatar
  mk('path', {
    d: 'M 50 18 L 50 82 M 24 40 L 76 40 M 36 82 L 64 82',
    stroke: 'rgba(196,186,170,0.34)', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round',
  });
  mk('circle', { cx: 50, cy: 12, r: 6.2, stroke: 'rgba(196,186,170,0.34)', 'stroke-width': 2.2, fill: 'none' });

  const nodes = {};
  for (const [key, p] of Object.entries(NODES)) {
    const g = mk('g', { transform: `translate(${p.x} ${p.y})` });
    // halo: invisible until a wound, then it is the thing that makes an 8 px node visible
    // from the centre of the screen
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('r', 9);
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke-width', 3);
    halo.setAttribute('stroke', 'transparent');
    g.appendChild(halo);
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('r', 9);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke-width', 2.6);
    g.appendChild(ring);
    const core = document.createElementNS(NS, 'circle');
    core.setAttribute('r', 4.4);
    g.appendChild(core);
    const mark = document.createElementNS(NS, 'path');
    mark.setAttribute('fill', 'none');
    mark.setAttribute('stroke-width', 1.8);
    mark.setAttribute('stroke-linecap', 'round');
    g.appendChild(mark);
    // the torn stub left behind: three short spurs, only shown when the socket is empty
    const tear = document.createElementNS(NS, 'path');
    tear.setAttribute('d', 'M -9 -5 L -13 -8 M -10 0 L -15 0 M -9 5 L -13 8');
    tear.setAttribute('stroke-width', 1.6);
    tear.setAttribute('fill', 'none');
    g.appendChild(tear);
    nodes[key] = { g, halo, ring, core, mark, tear, flash: 0 };
  }

  // ---- weapon readout, to the right of the schematic.
  //
  // This used to print `rig.held.label` and nothing else, which is how the HUD came to lie:
  // after both arms were torn off it still read "ARM" and the trigger still reported
  // `limbClub`, because `held` was never cleared. It now prints what a trigger pull would
  // ACTUALLY use — and prints UNARMED, in the warning colour, when that is nothing.
  const weap = document.createElement('div');
  weap.style.cssText = `position:absolute;left:198px;bottom:52px;display:flex;align-items:center;gap:10px;
    transition:color .2s`;
  const weapGlyph = document.createElement('div');
  weapGlyph.style.cssText = `width:44px;height:5px;border-radius:3px;transition:background .2s,box-shadow .2s`;
  const weapText = document.createElement('span');
  weap.appendChild(weapGlyph); weap.appendChild(weapText);
  root.appendChild(weap);

  // ---- context prompt, just above the schematic
  const prompt = document.createElement('div');
  // The id is for instruments, and it is the ONLY handle on what the game is currently
  // ADVERTISING. `mechanics.mjs`'s whole reason for existing is "an advertised control that does
  // nothing"; you cannot assert that without reading the advertisement off the screen the player
  // is looking at, and a positional selector over anonymous divs breaks the first time this
  // panel gains a row. Nothing in the game reads it.
  prompt.id = 'rrr-prompt';
  prompt.style.cssText = `position:absolute;left:38px;bottom:224px;opacity:0;transition:opacity .18s;
    color:#cbbfa6`;
  root.appendChild(prompt);

  // ---- state line: the one thing that is not a socket. Gait, when it is not normal.
  const state = document.createElement('div');
  state.style.cssText = `position:absolute;left:38px;bottom:12px;color:#7a6f60`;
  root.appendChild(state);

  // ---- THE RUN CLOCK. See `setRunClock()`.
  //
  // Bottom RIGHT, which is the only corner this file was not already using, and deliberately
  // the dimmest thing on screen. `docs/design/escape.md` §9 makes time-to-escape the entire
  // score, so the clock cannot be invisible — but §7 reserves the right to SHOUT for the
  // wind-down countdown, which is not built. If this is as loud as that will be, that one has
  // nowhere left to go, and the file's own rule is that a screen full of meters is the fastest
  // way to make a dark house feel safe.
  const clock = document.createElement('div');
  clock.style.cssText = `position:absolute;right:38px;bottom:34px;color:#5c6a7a;opacity:0;
    font-variant-numeric:tabular-nums;transition:opacity .3s,color .3s`;
  root.appendChild(clock);

  // ---- the callout. Layer 3 of a wound, and the deny message. Above the crosshair, never
  // on it: a message that covers the thing that just hurt you is not feedback.
  const callout = document.createElement('div');
  callout.style.cssText = `position:absolute;left:0;right:0;top:34%;text-align:center;opacity:0;
    font:700 20px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.42em;
    text-shadow:0 0 18px rgba(0,0,0,.95),0 2px 4px rgba(0,0,0,.9)`;
  root.appendChild(callout);
  const calloutRule = document.createElement('div');
  calloutRule.style.cssText = `position:absolute;left:50%;top:calc(34% + 30px);height:2px;width:0;
    transform:translateX(-50%);opacity:0`;
  root.appendChild(calloutRule);

  // ---- THE UNWEDGE NUDGE. See `turnCue()`.
  //
  // A screen-EDGE element, on purpose and by the same invariant as everything else in this file:
  // the thing that is on screen when this fires is a close-up of a wall, and the player is
  // trying to find anything in the frame that is not it. A centred arrow would cover the one
  // strip of picture they still have. Two elements — a soft inward wash that says "this side"
  // and a chevron that says "turn" — because the wash alone reads as damage and the chevron
  // alone is too small to notice at the edge of vision.
  const nudgeWash = document.createElement('div');
  nudgeWash.style.cssText = 'position:absolute;inset:0;opacity:0';
  root.appendChild(nudgeWash);
  const nudgeMark = document.createElementNS(NS, 'svg');
  nudgeMark.setAttribute('viewBox', '0 0 40 120');
  nudgeMark.style.cssText = `position:absolute;top:50%;width:40px;height:120px;margin-top:-60px;
    opacity:0;overflow:visible`;
  const nudgePath = document.createElementNS(NS, 'path');
  nudgePath.setAttribute('fill', 'none');
  nudgePath.setAttribute('stroke', '#cbbfa6');
  nudgePath.setAttribute('stroke-width', '3.2');
  nudgePath.setAttribute('stroke-linecap', 'round');
  nudgePath.setAttribute('stroke-linejoin', 'round');
  nudgeMark.appendChild(nudgePath);
  root.appendChild(nudgeMark);

  // ---- centre mark. A dot, not a crosshair — you are aiming a nail gun bolted to an arm.
  const dot = document.createElement('div');
  dot.style.cssText = `position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;
    border-radius:50%;background:rgba(226,216,196,.62);box-shadow:0 0 6px rgba(0,0,0,.9)`;
  root.appendChild(dot);

  mount.appendChild(root);

  const prev = {};
  let promptText = '';
  let threat = 0, threatShown = 0, breathe = 0;
  // ---- the chase channel. See `paintThreat` and `alarm()`.
  let chasing = false, chasePunch = 0;
  // one wound event at a time — a second limb coming off RESTARTS the whole display rather
  // than adding to it, so two hits in quick succession read as two hits and not as one long
  // smear
  let wound = null;      // { t, socket, name }
  let nudge = null;      // { t, dur, turn } — see turnCue()
  let msg = null;        // { t, dur, text, colour, rank }
  let queue = [];        // deferred messages, highest rank first — see RANK
  let deny = 0;
  let rosette = 0;       // schematic punch, 1 -> 0
  let targetSocket = null;   // the socket `E` will act on — see the target ring in paint()
  let targetSpin = 0;

  // The rig is the only authority on what came off, so subscribe to it directly rather than
  // diffing socket state once a frame: a limb that is torn off and refitted between two
  // paints is a wound the player felt and the poll would have missed entirely.
  const unsub = rig?.onChange?.((_r, what) => {
    if (!what || what.kind !== 'detach') return;
    const w = WOUND_AT[what.socket];
    if (!w) return;
    // A CHOICE AND A CATASTROPHE MUST NOT LOOK THE SAME. Taking your own gadget off used to
    // fire the whole trauma response — red wound overlay, rosette punch, "TORN OFF" — which
    // both lies about what happened and, worse, trains the player to ignore the alarm that
    // exists to tell them they are being taken apart. A voluntary eject gets an amber
    // acknowledgement at DENY rank and nothing else: no wound, no punch, no red.
    if (what.voluntary) {
      nodes[what.socket] && (nodes[what.socket].flash = 0.35);
      say(`${w.name} REMOVED`, '#ffb648', 1.1, RANK.deny);
      return;
    }
    wound = { t: 0, socket: what.socket, name: w.name, x: w.x, y: w.y };
    rosette = 1;
    nodes[what.socket] && (nodes[what.socket].flash = 1);
    say(`${w.name} TORN OFF`, '#ff6a4d', 1.9, RANK.wound);
  }) ?? null;

  /**
   * Put a line in the callout slot, or queue it. `rank` is one of RANK; the default is DENY,
   * which is what an unannotated caller almost always is (something the player did).
   */
  function say(text, colour, dur, rank = RANK.deny) {
    const m = { t: 0, dur, text, colour, rank };
    if (!msg) { msg = m; return; }
    if (rank > msg.rank) { defer(msg); msg = m; return; }
    // Equal rank: let the one on screen be read first. Below MIN_HOLD it queues; above it, the
    // new event is the more interesting one and takes over.
    if (rank === msg.rank) { if (msg.t >= MIN_HOLD) msg = m; else enqueue(m); return; }

    // ---- LOWER RANK, and DENY is not like the others.
    //
    // ⚠️ A DENY IS THE ANSWER TO A BUTTON THE PLAYER IS PRESSING RIGHT NOW, AND AN ANSWER THAT
    // ARRIVES LATER THAN THE QUESTION IS NOT AN ANSWER. The first version of this arbitration
    // treated rank as absolute and queued it, and `feel-a` caught what that costs: strip both
    // arms (two wound lines, 1.9 s each, the second one queued behind the first), wait 2.6 s,
    // then press the trigger — and the HUD answers "LEFT ARM TORN OFF", a caption for an event
    // the player watched happen nearly three seconds ago, while the button they just pressed
    // goes unacknowledged for another 1.2 s. The old last-writer-wins code got this ONE case
    // right by accident.
    //
    // So a deny may take the slot from a higher-ranked line that has already had its MIN_HOLD
    // — the wound has been read by then, and it still owns four other feedback channels (the
    // rim flash, the directional bias, the schematic node and the rosette); the callout is
    // only its caption. And a deny NEVER queues: if it cannot be said now it is not worth
    // saying, and the deny flash fires regardless of who holds the text.
    if (rank === RANK.deny) { if (msg.t >= MIN_HOLD) { defer(msg); msg = m; } return; }
    enqueue(m);
  }

  /** Interrupted, not cancelled: keep what is left of it, if that is long enough to read. */
  function defer(m) {
    const left = m.dur - m.t;
    if (left < MIN_RESTORE) return;
    enqueue({ ...m, t: 0, dur: left, deferred: true });
  }

  function enqueue(m) {
    // A stale place caption is worse than none: if you walked through three rooms while a limb
    // came off, only the room you are standing in now is worth saying. Wounds all matter.
    if (m.rank === RANK.place) queue = queue.filter((q) => q.rank !== RANK.place);
    queue.push(m);
    // stable sort by rank, highest first — arrival order is preserved inside a rank
    queue.sort((a, b) => b.rank - a.rank);
    if (queue.length > QUEUE_MAX) queue.length = QUEUE_MAX;
  }

  function paintWound(dt) {
    if (!wound) {
      if (woundRim.style.opacity !== '0') { woundRim.style.opacity = '0'; woundBias.style.opacity = '0'; }
      return;
    }
    wound.t += dt;
    const k = wound.t / WOUND_DUR;
    if (k >= 1) { wound = null; woundRim.style.opacity = '0'; woundBias.style.opacity = '0'; return; }

    // the punch: hot, 70 ms, gone. It reaches further in than the throb does — briefly.
    const punch = Math.max(0, 1 - wound.t / 0.07);
    // the throb: three pulses under a falling envelope
    const env = (1 - k) * (1 - k);
    const throb = env * (0.55 + 0.45 * Math.abs(Math.cos(k * Math.PI * 3)));

    // The clear core NEVER closes below 24% of the frame. That is the invariant: whatever
    // just took the limb is somewhere on screen, and the feedback for being hurt must not be
    // the reason you cannot see it.
    const core = 46 - punch * 22 - throb * 8;          // percent, 24..46
    const a = Math.min(1, punch * 0.86 + throb * 0.80);
    woundRim.style.opacity = a.toFixed(3);
    const hot = Math.round(70 + punch * 150);
    woundRim.style.background =
      `radial-gradient(ellipse 96% 96% at 50% 50%,` +
      ` rgba(255,${hot},${hot - 20},0) ${core.toFixed(0)}%,` +
      ` rgba(255,${hot},${Math.max(0, hot - 34)},0.55) ${(core + 26).toFixed(0)}%,` +
      ` rgba(255,${Math.round(38 + punch * 120)},26,0.96) 100%)`;

    // direction: a tight, explicitly sized pool over the socket that emptied. Sized in px
    // rather than as a percentage of the gradient box, or "18%" is 250 px on one screen and
    // 640 px on another and the bias smears across the middle of the frame.
    woundBias.style.opacity = Math.min(1, throb * 0.95 + punch * 0.55).toFixed(3);
    woundBias.style.background =
      `radial-gradient(circle 300px at ${wound.x}% ${wound.y}%,` +
      ` rgba(255,104,68,0.60) 0%, rgba(255,64,42,0.24) 42%, rgba(255,44,30,0) 100%)`;
  }

  /** Life of one nudge, seconds. Long enough to be found at the edge of vision, short enough
   * that it is gone before the player has finished the turn it asked for. */
  const NUDGE_DUR = 2.4;

  function paintNudge(dt) {
    if (!nudge) {
      if (nudgeWash.style.opacity !== '0') { nudgeWash.style.opacity = '0'; nudgeMark.style.opacity = '0'; }
      return;
    }
    nudge.t += dt;
    const k = nudge.t / NUDGE_DUR;
    if (k >= 1) { nudge = null; nudgeWash.style.opacity = '0'; nudgeMark.style.opacity = '0'; return; }
    // in fast, out slow — the opposite envelope to a wound, so the two can never be confused
    const rise = Math.min(1, nudge.t / 0.16);
    const env = rise * (1 - k) * (1 - k);
    // a slow double sweep, so it reads as an instruction to keep going rather than as a state
    const sweep = 0.62 + 0.38 * Math.sin(nudge.t * 4.6);
    const a = env * sweep;
    const left = nudge.turn === 'left';

    // The wash is EXPLICITLY transparent across the middle 52% of the frame. Same invariant as
    // the wound rim and the threat vignette: nothing this file draws may cover the picture.
    nudgeWash.style.opacity = (a * 0.5).toFixed(3);
    nudgeWash.style.background =
      `linear-gradient(${left ? '90deg' : '270deg'},`
      + ` rgba(206,190,158,0.30) 0%, rgba(180,166,138,0.10) 16%, rgba(0,0,0,0) 24%)`;

    nudgeMark.style.opacity = a.toFixed(3);
    // it drifts the way it is pointing, ~14 px, which is most of what makes it read as a verb
    const drift = (1 - env) * 14;
    nudgeMark.style.left = left ? `${(26 - drift).toFixed(0)}px` : '';
    nudgeMark.style.right = left ? '' : `${(26 - drift).toFixed(0)}px`;
    nudgePath.setAttribute('d', left
      ? 'M 26 22 L 10 60 L 26 98 M 38 34 L 25 60 L 38 86'
      : 'M 14 22 L 30 60 L 14 98 M 2 34 L 15 60 L 2 86');
  }

  /**
   * Pull the next line off the queue, TRIMMED IF OTHERS ARE STILL WAITING BEHIND IT. Four
   * limbs coming off has to read as four events (which is why they queue instead of stomping
   * each other) without turning into 7.6 s of text scrolling past a player who is by then
   * either dead or running — so a backlog drains at a readable minimum and only the last
   * line, with nothing behind it, gets its full designed hold.
   */
  function nextMsg() {
    const m = queue.shift() ?? null;
    if (m && queue.length) m.dur = Math.min(m.dur, MIN_HOLD + 0.28);
    return m;
  }

  function paintMsg(dt) {
    if (deny > 0) deny = Math.max(0, deny - dt);
    if (!msg && queue.length) msg = nextMsg();
    if (!msg) { if (callout.style.opacity !== '0') { callout.style.opacity = '0'; calloutRule.style.opacity = '0'; } return; }
    msg.t += dt;
    if (msg.t >= msg.dur) {
      // Straight into the next one if something is waiting. The rule wipe restarts, so two
      // queued lines read as two events rather than as one line changing its text.
      msg = nextMsg();
      if (!msg) { callout.style.opacity = '0'; calloutRule.style.opacity = '0'; return; }
    }
    const hold = msg.dur * 0.5;
    const a = msg.t < hold ? 1 : 1 - (msg.t - hold) / (msg.dur - hold);
    callout.textContent = msg.text;
    callout.style.color = msg.colour;
    callout.style.opacity = a.toFixed(3);
    // the rule wipes out from the centre in the first 180 ms, then holds — it is what makes
    // the line read as an event rather than as a label that was always there
    const w = Math.min(1, msg.t / 0.18);
    calloutRule.style.width = `${(w * 260).toFixed(0)}px`;
    calloutRule.style.background = `linear-gradient(90deg,transparent,${msg.colour},transparent)`;
    calloutRule.style.opacity = (a * 0.85).toFixed(3);
  }

  /**
   * TWO MODES, AND THE SPLIT IS THE WHOLE POINT — it is this file's own original argument,
   * finished.
   *
   * The note that used to sit on the line below read: *"slow, and slower still when it is faint
   * — a fast pulse reads as an alarm, and an alarm is a thing you can act on. This is a thing
   * you cannot."* That is exactly right about PRESENCE, and exactly wrong once the hunter has
   * committed, because by then it IS a thing you can act on. Measured
   * (`harness/scenarios/flee-survival.mjs`): staged 7 m apart with the hunter already in
   * PURSUE, a player who sprints away keeps all four limbs and ends 7.2 m clear; one who
   * sprints on the rear-back, already inside reach at 2.0 m, also keeps all four; one who
   * stands still loses three in 8.1 s. Running is the answer and it works at every point in the
   * encounter.
   *
   * So the same channel now carries both halves, and the boundary between them is the one
   * moment in the round the player must not miss:
   *   NOT COMMITTED  the original slow breath, unchanged in rate, depth, colour and cap. A
   *                  mood. There is nothing to do about it and it must not pretend otherwise.
   *   COMMITTED      a fast, hard, hotter pulse that does not sit still, plus a single bright
   *                  PUNCH on the frame it changes over. That punch is the tell.
   *
   * The transparent core is preserved in both — 40% of frame minimum, and the punch pulls it
   * IN rather than filling it, so the thing that is about to hurt you is never behind the
   * feedback that says so. That invariant is why the first attempt at this channel (a screen
   * -blended inset shadow) had to be thrown away.
   */
  function paintThreat(dt) {
    breathe += dt;
    threatShown += (threat - threatShown) * Math.min(1, dt * 2.4);
    chasePunch = Math.max(0, chasePunch - dt / 0.62);
    if (threatShown < 0.004 && chasePunch <= 0) {
      if (threatEl.style.opacity !== '0') threatEl.style.opacity = '0';
      return;
    }
    // ⚠️ THE PUNCH IS TAKEN AS A FLOOR, NOT ADDED, AND `pulse` IS CLAMPED. The first version
    // wrote `a * w + punch * 0.62` with a chase pulse of `0.44 + 0.56*sin(...)`, which reaches
    // **−0.12** at the bottom of its swing — so a punch landing on a trough had the pulse
    // SUBTRACTED from it and the alarm was quietest at the exact instant it fired. Measured
    // against a screenshot: with the camera turned away from the hunter, the commit punch came
    // out at 1.4x the noise floor and looked like nothing, while the same punch facing it
    // measured 7.1x — and that gap was read as "the tell needs the eye light" when half of it
    // was this arithmetic.
    const punch = chasePunch;                   // linear over 0.62 s: a spike, not a slope
    const pulse = chasing
      ? 0.58 + 0.42 * Math.sin(breathe * 8.2)
      : 0.62 + 0.38 * Math.sin(breathe * (1.5 + threatShown * 2.6));
    // Gamma below 1 so the QUIET end is where the range lives. Linear opacity made a threat of
    // 0.4 — a hunter that has heard you and is coming through a wall you cannot see it through
    // — read as nothing at all in the driven screenshot, which is precisely the beat this
    // channel exists for.
    const a = Math.max(0, Math.pow(threatShown, 0.62) * pulse);
    // The uncommitted branch is arithmetically IDENTICAL to what this file shipped before the
    // chase channel existed — same pulse, same weight, same 0.62 cap. Presence was not the
    // thing that was wrong and must not be made louder by accident.
    const sustained = Math.min(chasing ? 0.88 : 0.62, a * (chasing ? 0.90 : 0.72));
    threatEl.style.opacity = Math.max(sustained, punch * 0.86).toFixed(3);
    // Darkens and reddens the corners; the middle 40% of the frame is untouched at any
    // intensity. The core closes as it rises, so the frame feels like it is narrowing around
    // you rather than like a filter has been switched on.
    const core = Math.max(40, (chasing ? 47 : 52) - threatShown * 12 - punch * 6);
    // The chase palette is hotter and the punch is hotter still, but the innermost stop stays
    // fully transparent in every case, so no amount of alarm can wash the centre of the frame.
    const rim = chasing ? [126, 17, 12] : [74, 7, 6];
    const mid = chasing ? [92, 12, 9] : [56, 6, 6];
    const rr = Math.round(rim[0] + punch * 118), rg = Math.round(rim[1] + punch * 52), rb = Math.round(rim[2] + punch * 34);
    const mr = Math.round(mid[0] + punch * 96), mg = Math.round(mid[1] + punch * 40), mb = Math.round(mid[2] + punch * 26);
    threatEl.style.background =
      `radial-gradient(ellipse 86% 86% at 50% 50%,` +
      ` rgba(38,4,4,0) ${core.toFixed(0)}%,` +
      ` rgba(${mr},${mg},${mb},0.55) ${(core + 24).toFixed(0)}%,` +
      ` rgba(${rr},${rg},${rb},0.96) 100%)`;
  }

  function paint(dt = 0) {
    if (!rig) return;
    for (const key of Object.keys(NODES)) {
      const n = nodes[key];
      const kind = rig.occupant(key);
      const gadget = rig.sockets[key]?.item?.gadget ?? null;
      const foreign = kind === 'limb' && rig.sockets[key].item?.owner && rig.sockets[key].item.owner !== rig.id;

      // Poll as a BACKSTOP only — the onChange subscription above is the real trigger. This
      // catches a socket emptied by something that does not go through `_changed`.
      if (prev[key] !== undefined && prev[key] !== kind && kind === 'empty' && n.flash <= 0) n.flash = 1.0;
      prev[key] = kind;
      // 2.4 s, not the old 1.2 s at dt*0.85 — and squared, so it holds bright and then goes
      n.flash = Math.max(0, n.flash - dt / 2.4);
      const f = n.flash;
      const pulse = f > 0 ? (0.45 + 0.55 * Math.abs(Math.cos((1 - f) * Math.PI * 3))) * f : 0;

      if (kind === 'empty') {
        n.ring.setAttribute('stroke', `rgba(${lerp(120, 255, pulse)},${lerp(96, 92, pulse)},${lerp(80, 62, pulse)},${0.66 + pulse * 0.34})`);
        n.core.setAttribute('fill', 'rgba(6,6,7,0.95)');
        n.mark.setAttribute('d', '');
        n.tear.setAttribute('stroke', `rgba(${lerp(150, 255, pulse)},${lerp(112, 110, pulse)},${lerp(92, 76, pulse)},${0.6 + pulse * 0.4})`);
        n.halo.setAttribute('stroke', pulse > 0.01 ? `rgba(255,74,48,${(pulse * 0.55).toFixed(3)})` : 'transparent');
        n.halo.setAttribute('r', (9 + pulse * 11).toFixed(2));
        n.halo.setAttribute('stroke-width', (3 + pulse * 4).toFixed(2));
      } else if (kind === 'gadget') {
        n.ring.setAttribute('stroke', 'rgba(214,176,96,0.92)');
        n.core.setAttribute('fill', 'rgba(214,176,96,0.14)');
        n.mark.setAttribute('d', GADGET_MARK[gadget] ?? '');
        n.mark.setAttribute('stroke', 'rgba(232,198,120,0.95)');
        n.tear.setAttribute('stroke', 'transparent');
        n.halo.setAttribute('stroke', 'transparent');
      } else {
        // a scavenged limb reads differently from your own: it is a part that does not
        // belong to you and the HUD should never let you forget it
        n.ring.setAttribute('stroke', foreign ? 'rgba(150,196,186,0.85)' : 'rgba(214,206,190,0.86)');
        n.core.setAttribute('fill', foreign ? 'rgba(150,196,186,0.62)' : 'rgba(214,206,190,0.62)');
        n.mark.setAttribute('d', '');
        n.tear.setAttribute('stroke', 'transparent');
        n.halo.setAttribute('stroke', 'transparent');
      }
    }

    // ---- THE TARGETED SOCKET — the rosette IS the inventory cursor.
    //
    // `docs/design/attachments.md` Model C (John's call): no menus, no backpack. The four
    // sockets already on screen are the whole inventory UI, so the one `E` would act on has
    // to be visibly picked out. Drawn as a dashed ring that rotates, because a static ring
    // reads as another piece of body state rather than as a cursor the player controls.
    for (const [key, n] of Object.entries(nodes)) {
      const on = key === targetSocket;
      n.target ??= (() => {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', '12.5');
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke-width', '1.6');
        c.setAttribute('stroke-dasharray', '3.4 3.4');
        c.setAttribute('stroke', 'transparent');
        n.g.appendChild(c);
        return c;
      })();
      n.target.setAttribute('stroke', on ? 'rgba(214,176,96,0.92)' : 'transparent');
      if (on) {
        targetSpin = (targetSpin + dt * 46) % 360;
        n.target.setAttribute('transform', `rotate(${targetSpin.toFixed(1)})`);
      }
    }

    // the schematic punch
    if (rosette > 0) {
      rosette = Math.max(0, rosette - dt / 0.5);
      const s = 1 + Math.sin(rosette * Math.PI) * 0.18;
      svg.style.transform = `scale(${s.toFixed(4)})`;
    } else if (svg.style.transform !== 'scale(1)') svg.style.transform = 'scale(1)';

    // ---- what a trigger pull would actually do, which is not the same as what is held
    //
    // THE HAMMER TAKES PRIORITY, AND IT IS CHECKED FIRST, AHEAD OF `rig.activeWeapon` — for
    // the same reason `Player.attack()` checks it first: both hands are already committed to
    // it, so there is nothing for the rig's own weapon to sensibly contend with. A steel-blue
    // glyph, distinct from the gadgets' amber and the club/fist's bone colour, so the readout
    // itself says "this is not a socket item" before the player ever reads the word.
    if (sledge?.equipped) {
      weapText.textContent = WEAPON_LABEL.sledge;
      weap.style.color = '#c8bda9';
      weapGlyph.style.background = '#9fb0c2';
      weapGlyph.style.boxShadow = '9px 0 0 -1px #9fb0c2, 0 0 14px rgba(159,176,194,.40)';
    } else {
      const w = rig.activeWeapon;
      if (w) {
        const hot = w === 'limbClub';
        weapText.textContent = WEAPON_LABEL[w] ?? String(w).toUpperCase();
        weap.style.color = '#c8bda9';
        weapGlyph.style.background = hot ? '#c8bda9' : '#d6b060';
        weapGlyph.style.boxShadow = `9px 0 0 -1px ${hot ? '#c8bda9' : '#d6b060'}, 0 0 14px rgba(200,189,169,.35)`;
      } else {
        weapText.textContent = 'UNARMED';
        weap.style.color = deny > 0 ? '#ff7a5c' : '#8a5145';
        weapGlyph.style.background = deny > 0 ? '#ff7a5c' : '#3a2320';
        weapGlyph.style.boxShadow = deny > 0 ? '0 0 16px rgba(255,122,92,.7)' : 'none';
      }
    }

    // the centre dot answers a dead trigger too, because that is where the player is looking
    if (deny > 0) {
      const k = deny / 0.3;
      dot.style.background = `rgba(255,${lerp(226, 90, k)},${lerp(196, 70, k)},${(0.62 + k * 0.38).toFixed(2)})`;
      dot.style.transform = `scale(${(1 + k * 3.4).toFixed(2)})`;
    } else if (dot.style.transform !== 'scale(1)') {
      dot.style.background = 'rgba(226,216,196,.62)';
      dot.style.transform = 'scale(1)';
    }

    const caps = rig.caps;
    state.textContent = caps.downed ? 'DOWN'
      : caps.gait === 'crawl' ? 'CRAWLING'
        : caps.gait === 'limp' ? 'ONE LEG'
          : caps.gait === 'skate' ? 'SKATES' : '';
    state.style.color = caps.downed ? '#b8503c' : '#7a6f60';

    paintWound(dt);
    paintNudge(dt);
    paintMsg(dt);
    paintThreat(dt);
  }

  paint(0);

  return {
    el: root,
    update(dt) { paint(dt); },
    setPrompt(text) {
      if (text === promptText) return;
      promptText = text;
      prompt.textContent = text ?? '';
      prompt.style.opacity = text ? '1' : '0';
    },
    /**
     * 0..1 — how much "something is coming" the frame should carry. See hunter-ai.js.
     * `committed` switches the channel from the slow breath to the chase pulse; it is
     * `HunterAI.committed`, i.e. the same latch `onCommit` fires from, so the alarm and the
     * frame can never disagree about whether you are being chased.
     */
    setThreat(v, committed = false) {
      threat = Math.max(0, Math.min(1, v || 0));
      chasing = !!committed;
    },
    /**
     * IT HAS STOPPED CONSIDERING AND STARTED COMING — the one discrete event on this channel.
     *
     * Fired from `HunterAI.onCommit`, once per commitment (the latch is in the AI, not here,
     * so a chase that flickers across PURSUE's hysteresis cannot turn the alarm into
     * wallpaper). It says a FACT about the world and not an instruction: this HUD has no
     * minimap and no threat direction on purpose, and "IT HAS SEEN YOU" answers "what just
     * happened" without answering "where is it". What to do about it is the player's problem,
     * and — measured — running is a real answer at this point in the encounter.
     */
    alarm(text = 'IT HAS SEEN YOU') {
      chasePunch = 1;
      say(text, '#ff9d3a', 1.25, RANK.alarm);
    },
    /**
     * THE CAMERA HAS NOWHERE TO GO — TURN THIS WAY.
     *
     * Fired from `ThirdPersonCamera.onWedge` (the latch lives there, for the same reason the
     * commit latch lives in the AI: `tight` is a smoothed value sitting on a threshold and a
     * state-tested cue would be wallpaper inside one round).
     *
     * play-critic-5 wedged itself twice, by two independent navigation strategies, and measured
     * the part that makes it expensive: **re-aiming at your goal does not free you.** Pointing
     * at where you want to go is the first thing anyone does and it is exactly wrong here, so
     * the missing information is not "you are stuck" — the macro-close wall already says that
     * unmistakably — it is WHICH WAY. Hence a direction and not a warning.
     *
     * ⚠️ AMBER-NEUTRAL, NEVER RED, AND NOT AT WOUND RANK. This is a hint about a lens, not an
     * event in the world. The one thing this file must never do is spend the alarm vocabulary
     * on something that is not the hunter — see the voluntary-eject note above, which is the
     * same mistake caught earlier: if a camera hint and a limb coming off share a colour, the
     * player learns to ignore both. It also does not queue: a direction that arrives after the
     * player has already turned is worse than nothing.
     *
     * `first` spends a text line the first time it ever happens in a session and only the quiet
     * edge nudge afterwards. Explaining the camera is worth one line and is noise the fifth time.
     */
    turnCue(turn = 'left', first = false) {
      nudge = { t: 0, turn: turn === 'right' ? 'right' : 'left' };
      if (first) say(`NO ROOM — TURN ${turn === 'right' ? 'RIGHT' : 'LEFT'}`, '#cbbfa6', 1.6, RANK.deny);
    },
    /**
     * TAKE THE WHOLE HUD OFF SCREEN. For a full-screen modal, and only for that.
     *
     * ⚠️ THIS IS THE BOOT-SPLASH BUG AGAIN AND IT WAS CAUGHT IN A SCREENSHOT, NOT IN CODE.
     * The escape screen prints the run time in 44 px at `top: 34%`; the callout slot above
     * lives at exactly `top: 34%` too, so the room caption `THE CHAPEL` rendered struck
     * through `0:02.7` — two centred texts printed over each other, which is the same defect,
     * in the same place, that `#boot` and the play gate produced. A modal owns the frame.
     *
     * Opacity rather than `display`, so `paint()` keeps running and nothing has to learn a new
     * lifecycle; the HUD is `pointer-events:none` already so it cannot swallow the button.
     */
    setHidden(v) { root.style.opacity = v ? '0' : '1'; },
    /** Diagnostics only — is a turn cue on screen, and which way. */
    _nudgeState() { return nudge ? { turn: nudge.turn, t: +nudge.t.toFixed(2) } : null; },
    /** The trigger did nothing and the player must be told why. */
    denyAttack(reason = 'NO WEAPON') { deny = 0.3; say(reason, '#ff7a5c', 1.1, RANK.deny); },
    /** Any one-line callout, for whatever else needs to be unmissable. See RANK. */
    say,
    /**
     * Which socket `E` will act on. The rosette is the inventory cursor in Model C, so this
     * is the only "selection" the game has and it must be visible at all times.
     */
    setTargetSocket(s) { targetSocket = s; },
    targetSocket() { return targetSocket; },
    /** The ranks, so a caller outside this file can ask for the slot at the right priority. */
    RANK,
    /**
     * The name of the room you just walked into, for 2.2 s.
     *
     * NO MINIMAP, and that is a design decision rather than a budget one: a minimap hands the
     * player the shape of the house and — the moment threat is on it — the hunter's position,
     * for free. Learning the plan by walking it is most of what the mansion is for. A caption
     * is the smallest thing that answers "where am I" without answering "where is it".
     */
    setPlace(name) { if (name) say(String(name), '#9fb6cd', 2.2, RANK.place); },
    /**
     * HOW LONG YOU HAVE BEEN IN THE HOUSE — the whole of `escape.md` §9's score, in one line.
     *
     * Driven from `RunState.t`, i.e. from accumulated `dt` and not from wall-clock time, so a
     * shader compile or a starved frame cannot cost the player a place on the board. Formatted
     * to a tenth because the difference between two good runs is seconds and the difference
     * between a good one and a bad one is minutes; whole seconds would hide the first and
     * hundredths would just flicker.
     *
     * `phase` is `RunState.phase`. Only EXPLORE is styled here — WINDDOWN's countdown is a
     * different element with a different job (§10.4) and is deliberately NOT built into this
     * one, because a clock that counts up and a clock that counts down mean opposite things
     * and must never be the same widget wearing a different colour.
     */
    setRunClock(seconds, phase = 'EXPLORE') {
      if (seconds == null) { clock.style.opacity = '0'; return; }
      const s = Math.max(0, seconds);
      const m = Math.floor(s / 60);
      const txt = `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
      if (clock.textContent !== txt) clock.textContent = txt;
      clock.style.opacity = phase === 'RESULTS' ? '0' : '0.85';
    },
    /** For the capture views: force a socket's wound flash so a still shows the moment. */
    flash(socket, v = 1) {
      if (nodes[socket]) nodes[socket].flash = v;
      const w = WOUND_AT[socket];
      if (w) { wound = { t: 0, socket, name: w.name, x: w.x, y: w.y }; rosette = 1; say(`${w.name} TORN OFF`, '#ff6a4d', 1.9, RANK.wound); }
      paint(0);
    },
    /** Diagnostics only — what is in the slot and what is waiting for it. */
    _msgState() {
      return { text: msg?.text ?? null, rank: msg?.rank ?? null, t: msg ? +msg.t.toFixed(2) : null,
        dur: msg?.dur ?? null, deferred: !!msg?.deferred,
        queue: queue.map((q) => ({ text: q.text, rank: q.rank, dur: +q.dur.toFixed(2), deferred: !!q.deferred })) };
    },
    dispose() { unsub?.(); root.remove(); },
  };
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
