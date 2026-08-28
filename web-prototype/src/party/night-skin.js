/**
 * Shared chrome for the sit-down night. DOM only — no THREE, no mansion, no flyover.
 *
 * ⚠️ THE ROLE'S DISPLAY NAME IS NOT DECLARED HERE. It used to be, as a second table, and the two
 * disagreed: this file said `Editor`, `Method Actor`, `Fixer`, `Plant`, `Producer` while
 * `roles.js` — the file `docs/design/rrr-roles.md` is written into, and the one that carries the
 * line of rule text beside the name — says `The Editor`, `The Method Actor`, `The Fixer`,
 * `The Plant`, `The Producer`. A card and a Reunion roll call that name the same role differently
 * is a table arguing with itself out loud. `rolecard.js` reads `SCRIPT`, and so does everything
 * else now.
 */

import { NIGHT_TOKENS } from './palette.js';
import { ROLE_CARD_CSS } from './rolecard.js';
import { GUIDE_MAP_CSS } from './guidemap.js';
import { INTRO_FRAME_PCT, TV_FRAME_PCT } from './follow.js';
import { SHOW_CHROME_CSS } from './look.js';

export function playerName(players, id) {
  const p = (players || []).find((x) => x.id === id);
  return p?.name || id || '—';
}

export function injectNightSkin() {
  if (document.getElementById('rrr-night-skin')) return;
  const s = document.createElement('style');
  s.id = 'rrr-night-skin';
  s.textContent = `
    ${NIGHT_TOKENS}
    html, body { width:100%; height:100%; overflow:hidden; background:#0c0a08; }
    #boot.gone { display:none; }
    /* z-index 1 so the warming mansion (a fixed layer at z-index 0, see '.run-cam-layer.warm')
       sits BEHIND the lobby. Both are fixed and the layer is appended to <body> later, so without
       an explicit stack order DOM order would put the house in front of the join code. */
    .night { position:fixed; inset:0; z-index:1; color:#f3ece3; font-family: ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(900px 520px at 50% -8%, rgba(245,161,74,.10), transparent 58%),
        #0c0a08;
      display:flex; flex-direction:column; overflow:hidden; }
    .night * { box-sizing:border-box; }
    .night-top { display:flex; justify-content:space-between; align-items:flex-end; gap:16px;
      padding:18px 28px 10px; letter-spacing:.18em; text-transform:uppercase; }
    .night-brand { font-size:12px; color:#f5a14a; font-weight:700; }
    .night-phase { font-size:13px; color:#e8dcc8; }
    .night-line { padding:0 28px 16px; color:#a89884; font-size:18px; letter-spacing:.02em; max-width:52rem; }
    .night-main { flex:1; min-height:0; padding:8px 28px 24px; overflow:auto; }
    .night-code { font-size:clamp(48px, 10vw, 96px); font-weight:800; letter-spacing:.28em;
      color:#fff; line-height:1; font-variant-numeric:tabular-nums; }
    .night-sub { color:#8a7d70; font-size:13px; letter-spacing:.08em; text-transform:uppercase; margin-top:8px; }
    /* The '?dev=1' skip key's badge. LOUD ON PURPOSE — a dev TV that looks like a real one is
       how a skipped beat ends up in a playtest note as if the clock had run. Mounted outside
       '.night' by party-host.js, because paint() rewrites that subtree constantly.
       NO BACKTICKS IN HERE: this whole block is inside a template literal and one backtick
       ends the string. That is what the first version of this comment did. */
    .dev-badge { position:fixed; right:10px; bottom:10px; z-index:9999; pointer-events:none;
      font:700 11px/1 ui-monospace, monospace; letter-spacing:.14em; text-transform:uppercase;
      color:#141210; background:#f5a14a; padding:6px 10px; border-radius:4px;
      box-shadow:0 2px 10px rgba(0,0,0,.5); }
    .night-row { display:flex; gap:28px; align-items:flex-start; flex-wrap:wrap; }
    .night-qr { background:#f4efe6; padding:12px; border-radius:8px; flex:0 0 auto; }
    .night-qr svg { display:block; }
    .seats { display:grid; grid-template-columns:repeat(4, minmax(140px, 1fr)); gap:12px; margin-top:22px; }
    .seat { border:1px solid rgba(245,161,74,.18); border-radius:8px; padding:14px 14px 12px;
      min-height:86px; background:rgba(18,14,10,.75); transition: border-color .35s ease, box-shadow .35s ease, opacity .35s ease; }
    .seat.on { border-color:#f5a14a; box-shadow:0 0 0 1px rgba(245,161,74,.35); }
    .seat.away { opacity:.55; }
    .seat .seat-face { display:flex; justify-content:center; margin:0 0 8px; min-height:52px; }
    .seat .seat-face[hidden] { display:none; }
    .seat .bot-face { width:52px; height:52px; animation: night-rise .4s ease; }
    .seat .who { font-size:clamp(22px, 3vw, 36px); font-weight:700; letter-spacing:.02em; }
    .seat .meta { margin-top:6px; color:#8a7d70; font-size:12px; letter-spacing:.1em; text-transform:uppercase; }
    .btn { appearance:none; border:0; cursor:pointer; font:inherit; letter-spacing:.12em;
      text-transform:uppercase; font-weight:700; padding:16px 22px; border-radius:6px;
      background:#f5a14a; color:#1a1208; }
    .btn:disabled { opacity:.35; cursor:not-allowed; }
    .btn.ghost { background:transparent; color:#e8dcc8; border:1px solid rgba(232,220,200,.3); }
    .btn.wide { width:100%; }
    /* READY is a TOGGLE, so the two states have to be tellable apart at a glance on a phone
       held under a table. Un-tapped reads as an outline you have not used yet; tapped reads as
       filled and green. Same shape, so the row does not jump when it flips. */
    .btn.ready { background:transparent; color:#e8dcc8; border:1px solid rgba(232,220,200,.35);
      margin-top:10px; }
    .btn.ready.on { background:#a8c66c; color:#141210; border-color:#a8c66c; }
    /* 🚨 THE READY DOCK. Sticky, so eight players cannot push the beat's own end condition off
       the bottom of the phone — and so the control lands where the thumb already is. */
    .ready-dock { position:sticky; bottom:0; z-index:5; margin-top:14px;
      padding:10px 0 6px; background:#0c0a08;
      box-shadow:0 -14px 18px -6px #0c0a08; }
    .ready-dock .btn.ready { margin-top:8px; min-height:58px; }
    .ready-dock .hint { margin:8px 0 0; }
    .ready-meter { height:8px; border-radius:4px; background:#241f1a; overflow:hidden; }
    .ready-fill { height:100%; background:#f5a14a; transition:width .3s ease; }
    .ready-fill.met { background:#a8c66c; }
    /* 🔢 Which SAM — seat number in that player's own accent, on every tappable row. */
    .seat-chip { flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
      min-width:30px; height:30px; padding:0 6px; border-radius:15px; color:#141210;
      font-weight:900; font-size:15px; line-height:1; }
    .pick-list button { display:flex; align-items:center; gap:11px; }
    /* The ballot receipt — what the ROOM recorded, not what this phone thinks it sent. */
    .receipt { margin:10px 0 0; padding:11px 13px; border-radius:10px;
      background:rgba(168,198,108,.10); border-left:5px solid #a8c66c; }
    .receipt.coerced { background:rgba(255,138,122,.10); border-left-color:#ff8a7a; }
    .receipt-k { font-size:11px; letter-spacing:.22em; text-transform:uppercase;
      font-weight:800; color:#8a7d70; }
    .receipt-v { display:flex; align-items:center; gap:10px; margin-top:5px;
      font-size:20px; font-weight:800; color:#a8c66c; }
    .receipt.coerced .receipt-v { color:#ff8a7a; }
    .receipt .hint { margin:6px 0 0; }
    /* The pair sheet. Green is the pair colour and it matches LINK_INK on the 3D plate, so the
       phone in your hand and the tag on the television are obviously the same thing. */
    .pairbox { margin-top:14px; padding:12px; border-radius:8px;
      border:1px solid rgba(143,217,168,.28); background:rgba(31,122,61,.10); }
    .pairbox.on { border-color:#8FD9A8; background:rgba(31,122,61,.20); }
    /* THE PAIR BOARD, in the side rail the talk beats already own. Same nom-row language
       as the nomination board, so the two beats read as one show. */
    .pair-board-k { color:var(--night-accent); font-size:11px; letter-spacing:.26em;
      text-transform:uppercase; font-weight:700; margin:0 0 8px 2px; }
    .pair-row { border-left:4px solid #8FD9A8; }
    .pair-row.pair-1 { border-left-color:#8FB6F0; }
    .pair-row .show-third .who { color:#8FD9A8; }
    .pair-row.pair-1 .show-third .who { color:#8FB6F0; }
    .pair-faces { display:flex; align-items:center; margin-right:2px; }
    .pair-faces .bot-face { width:40px; height:40px; }
    .pair-faces .bot-face + .bot-face { margin-left:-14px; }
    .pair-wait { border-left:4px solid var(--night-accent); opacity:.85; }
    .pair-no { border-left:4px solid var(--night-bad); opacity:.85; }
    .pair-no .show-third .who { color:var(--night-bad); }
    .pair-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
    .pair-name { font-size:34px; font-weight:900; letter-spacing:.06em; color:#8FD9A8;
      line-height:1; margin-bottom:6px; }
    /* The conversation has a clock. Tabular figures so the number does not jitter. */
    .pair-clock { font-size:20px; font-weight:800; color:#8FD9A8; font-variant-numeric:tabular-nums;
      letter-spacing:.04em; }
    .pair-clock.low { color:#f5a14a; }
    .pair-actions { display:flex; gap:8px; margin-top:8px; }
    .pair-actions .btn { flex:1; padding:12px 10px; }
    .picks { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
    .picks button { flex:1 1 40%; padding:12px 10px; border-radius:6px; font:inherit;
      font-weight:700; letter-spacing:.06em; text-transform:uppercase; cursor:pointer;
      background:transparent; color:#e8dcc8; border:1px solid rgba(232,220,200,.28); }
    .picks button:disabled { opacity:.35; cursor:not-allowed; }
    /* Fixed height and its own scroll: the log must never push the text field off a phone. */
    .whispers { max-height:34vh; min-height:64px; overflow-y:auto; margin:8px 0;
      display:flex; flex-direction:column; gap:6px; }
    .whisper { margin:0; padding:8px 10px; border-radius:8px; align-self:flex-start;
      max-width:86%; background:#241f1a; color:#e8dcc8; font-size:15px; letter-spacing:.01em; }
    .whisper.me { align-self:flex-end; background:#1F7A3D; color:#f2fff5; }
    .charcount { text-align:right; margin:-8px 0 8px; font-size:12px; opacity:.7; }
    /* Disconnect cannot be undone and costs your conversation for the beat. It sits under the
       send button, so it has to look like the other kind of thing. */
    /* DONE is the friendly exit and has to look unlike Disconnect, which is the unfriendly
       one directly beneath it. Outline while it is your tap; filled once you have made it. */
    .btn.done { margin-top:8px; background:transparent; color:#8FD9A8;
      border:1px solid rgba(143,217,168,.5); }
    .btn.done.on { background:rgba(31,122,61,.35); color:#dffbe8; border-color:#8FD9A8; }
    .btn.ghost.danger { border-color:rgba(217,90,138,.5); color:#e8b6c6; margin-top:6px;
      font-size:12px; padding:12px 10px; }
    .send-go { display:flex; flex-direction:column; align-items:flex-start; gap:0;
      pointer-events:none; margin:8px 0 4px; }
    .send-go-k { color:#f5a14a; font-size:12px; letter-spacing:.28em; text-transform:uppercase;
      font-weight:700; }
    .send-count { font-size:clamp(120px, 22vw, 280px); font-weight:900; line-height:.9;
      color:#fff; letter-spacing:.04em; font-variant-numeric:tabular-nums;
      text-shadow:0 12px 48px rgba(0,0,0,.9); }
    .actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:22px; }
    /* 🛑 SKIP TO REUNION sits in the bottom corner of the television, quiet until it is armed.
       It ends everybody's night, so it must be findable by the host and invisible to the room:
       out of the picture's way, low contrast at rest, and unmistakable once the first tap has
       landed. Absolute, because the talk beats fill the well and a flow row would push it. */
    .skip-actions { position:absolute; right:22px; bottom:16px; margin:0; z-index:6; }
    .skip-actions .btn { padding:8px 14px; font-size:11px; letter-spacing:.16em;
      opacity:.42; transition:opacity .18s ease; }
    .skip-actions .btn:hover, .skip-actions .btn:focus-visible { opacity:1; }
    .skip-actions .btn.armed { opacity:1; border-color:#ff8a7a; color:#ff8a7a;
      background:rgba(255,138,122,.10); }
    .err { color:#ff8a7a; white-space:pre-wrap; font-family:ui-monospace,Menlo,monospace; font-size:13px; }
    .ballot { display:flex; flex-direction:column; gap:14px; }
    .ballot .row { display:grid; grid-template-columns: 1fr auto 1fr; gap:20px; align-items:center;
      padding:22px 26px; background:rgba(18,14,10,.8); border:1px solid rgba(245,161,74,.16); border-radius:8px; }
    .ballot .who { font-size:clamp(40px, 7vw, 84px); font-weight:800; line-height:1; }
    .ballot .pick { font-size:clamp(36px, 6vw, 72px); font-weight:800; text-align:right; line-height:1.1; }
    .ballot.huge .who { font-size:clamp(52px, 9vw, 96px); }
    .ballot.huge .pick { font-size:clamp(44px, 8vw, 84px); }
    .ballot .arrow { color:#f5a14a; letter-spacing:.2em; font-size:18px; text-transform:uppercase; }
    .ballot-why { color:#a89884; font-size:13px; letter-spacing:.08em; text-transform:uppercase;
      margin:0 0 12px; line-height:1.35; }
    .pair-hero { margin:18px 0 8px; font-size:clamp(48px, 10vw, 120px); font-weight:800; line-height:1.1; }
    /* THE FRAME IS THE SHOW, SO THE FRAME GETS THE SCREEN. PR #5 gave the pair-hero the whole
       lower half because there was nothing else on the TV during the run — a still and two names.
       With a live camera in the frame that split is backwards: the first drive photographed a
       1024x215 letterbox strip with the runner four storeys of type below it. The hero is now a
       strapline under the picture, and the picture takes the height. */
    .run-stage { display:flex; flex-direction:column; gap:2px; min-height:0; }
    /* 📺 **THE PICTURE TAKES WHAT IS LEFT OVER — IT DOES NOT TAKE 90% AND LET THE REST FALL OFF.**
       The run beat stacks a 'TV_FRAME_PCT'vh frame plus the hero line plus the facts line plus
       the reaction strip inside a 'night-main' that hides its overflow. Those four do not fit in
       what the chrome leaves: measured on a 1920x1080 set, 24 px of every 74 px reaction chip
       was below the screen edge and the player's NAME was not on the television at all — 39 px
       and no names at 1280x720. Nothing looked broken, because hidden overflow does not look
       like anything. It just quietly cut the bottom off the feature whose whole premise is that
       a reaction is attributed.
       The frame keeps its 'TV_FRAME_PCT' height as a CEILING and is now allowed to shrink below
       it, so the strip is laid out first and the picture fills the remainder at its 16:9. That
       is self-correcting at every resolution instead of tuned to one — the alternative was
       trimming the percentage until 720p happened to fit, which leaves nothing for the next
       thing anyone adds under the picture.
       ⚠️ 'min-height:0' on both is load-bearing: a flex item's default 'min-height:auto' refuses
       to shrink below its content, which is exactly the refusal that produced the clipping.
       The camera is a layer parented to body and re-registered from the frame's client rect
       every frame (see '.run-cam-layer'), so a frame that changes size is followed, not broken.
       Gate: 'party-warm' W41. */
    .night.on-run .run-stage { flex:1 1 auto; min-height:0; justify-content:flex-end; }
    .night.on-run .run-frame { flex:0 1 auto; min-height:0; }
    .run-stage .pair-hero { margin:6px 0 0; font-size:clamp(15px, 1.7vw, 28px); line-height:1.05;
      text-align:center; }
    .run-stage .pair-hero br { display:none; }
    .run-stage .run-facts { text-align:center; color:var(--night-dim); font-size:12px;
      letter-spacing:.16em; text-transform:uppercase; margin-top:2px; }
    /* 👏 THE REACTION STRIP — the six people who are not in the mansion, along the bottom.
       ⚠️ It sits UNDER the run frame and never over it. D13 and the chase-only rule make the
       run picture the product; a strip floated across it would be chrome covering the one thing
       the room is watching. The min-height holds the space whether or not anyone has reacted, so
       the frame above does not jump every time a face arrives or ages out. */
    .react-strip { display:flex; justify-content:center; align-items:flex-start; gap:18px;
      min-height:78px; padding:6px 12px 0; }
    .react-chip { display:flex; flex-direction:column; align-items:center; gap:3px;
      animation: night-rise .22s ease; }
    .react-chip .react-who { font-size:11px; letter-spacing:.08em; color:var(--night-soft);
      max-width:96px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* 🏷️ THE BADGE MOVES; THE FACE NEVER DOES.
       John's partner asked for "slightly animated", and slightly is the whole spec — about one
       pixel at the 56 px the strip uses. At sofa distance the motion is invisible anyway and the
       COLOUR is doing the work; the movement is for the person holding the phone and for the
       corner of your eye across the room. Bigger reads as the strip wobbling under the picture.
       ⚠️ EVERY LOOP RESTS AT 0% AND 100%, AND NONE OF THEM ALTERNATE. A chip can still be
       replaced mid-flight (a player reacting again swaps their face), and a loop that rests at
       both ends lands where it already was — an 'alternate' loop snaps to the bottom of its
       cycle instead, which is a visible tick. 'transform' only, so this stays on the compositor:
       the main thread on this beat is also feeding a WebGL mansion, and the run picture is the
       product. Gate: 'party-warm' W43. */
    .bot-badge { transform-box: fill-box; transform-origin: center;
      animation: badge-lift 1.1s ease-in-out infinite; will-change: transform; }
    .bot-badge[data-react="boo"]   { animation: badge-drop 1.0s ease-in-out infinite; }
    .bot-badge[data-react="sus"]   { animation: badge-tilt 1.4s ease-in-out infinite; }
    .bot-badge[data-react="shock"] { animation: badge-pulse .9s ease-in-out infinite; }
    @keyframes badge-lift  { 0%,100% { transform:none; } 50% { transform: translateY(-4%); } }
    @keyframes badge-drop  { 0%,100% { transform:none; } 50% { transform: translateY(5%); } }
    @keyframes badge-tilt  { 0%,100% { transform:none; } 50% { transform: rotate(4deg); } }
    @keyframes badge-pulse { 0%,100% { transform:none; } 50% { transform: scale(1.06); } }
    /* ♿ THE NIGHT SCREEN HAD NO REDUCED-MOTION BLOCK AT ALL, and it was already running three
       unguarded animations — two of them infinite. One goes in with the badge rather than after
       it. Nothing is lost when it applies: the badge's meaning is its SHAPE and its COLOUR, both
       of which are still. That is the test this had to pass — if switching the motion off
       destroyed the information, the motion was carrying the information, which would have been
       the wrong design. Gate: 'party-warm' W43b. */
    @media (prefers-reduced-motion: reduce) {
      .bot-badge, .run-face, .fl-rec, .react-chip, .look-stage.connecting .bot-face {
        animation: none !important; }
    }
    /* 📺 THE 90% FRAME ONLY FITS IF THE CHROME AROUND IT GETS OUT OF THE WAY, AND THAT IS THE
       HALF OF "less chrome" THAT IS EASY TO FORGET. A 90vh picture leaves ten per cent of a
       television for everything else, so on the run beat the top strip, the main padding and the
       strapline all shrink together and the one remaining control floats out of flow. Off the run
       beat nothing here applies and the lobby is exactly the screen it was. */
    .night.on-run .night-top { padding:4px 22px 0; }
    .night.on-run .night-brand { font-size:11px; }
    .night.on-run .night-phase { font-size:11px; }
    .night.on-run .show-rail { padding:0 22px 2px; }
    .night.on-run .night-main { padding:0 12px 4px; overflow:hidden;
      display:flex; flex-direction:column; justify-content:center; }
    /* Bottom-right, not top-right: the top strip already ends in the phase readout and the two
       collided on a 1920x1080 capture. Down here it is beside the facts line and out of the
       picture, which is the only thing on this screen anyone is looking at. */
    .night.on-run .run-actions { position:fixed; bottom:6px; right:22px; z-index:6; margin:0; }
    .night.on-run .run-actions .btn { padding:7px 12px; font-size:11px; letter-spacing:.14em; }
    /* D13. The frame is a MOUNT for the follow camera with the PR #5 still behind it as the
       slate: the mansion takes seconds to bake, and a TV with no WebGL degrades to exactly the
       screen it had before rather than to black. The live class is set when the follow reports
       its first rendered frame.
       These rules are NAMED, not hexed. palette.js: the tokens are "the whole palette for
       anything built after it", and the run frame is built after it. Widening the older rules
       above is still a tidy-up rather than this change.
       NOTE: this whole block is inside a JS template literal, so NO BACKTICKS in these comments
       — one terminated the string and took the dev server down while this slice was built. */
    /* A 16:9 box driven by HEIGHT, so the picture is a television rather than a letterbox strip
       whose shape depends on how wide the host tab happens to be. The follow's own 2.35:1 bars
       then sit inside a 16:9 frame, which is what a broadcast crop actually looks like.
       📺 THE HEIGHT IS 'TV_FRAME_PCT' OF THE SHORT SIDE AND THE 620 px CAP IS GONE.
       John: "TV follow ~90%." The cap was the thing that actually bit on a television — 620 px
       on a 1080p set is 57% of the height whatever the vh term says, so the picture was small
       on precisely the screen this view exists for. The width term is what keeps a 16:9 box
       inside a narrow window; see 'TV_FRAME_PCT' in src/party/follow.js for why it is the short
       side rather than the area. */
    .run-frame { position:relative;
      height:min(${TV_FRAME_PCT}vh, calc(${TV_FRAME_PCT}vw * 9 / 16)); aspect-ratio:16/9; width:auto;
      max-width:100%; margin:0 auto; display:flex;
      align-items:center; justify-content:center;
      border:2px solid rgba(var(--night-accent-rgb), .35); border-radius:14px; overflow:hidden;
      background:
        radial-gradient(ellipse 70% 80% at 50% 70%, rgba(var(--night-accent-rgb), .16), transparent 58%),
        linear-gradient(180deg, var(--night-panel) 0%, var(--night-deep) 100%);
      box-shadow: inset 0 0 80px rgba(0,0,0,.45); }
    /* The camera is a LAYER over the frame, parented to body, never inside .night — moving an
       iframe between parents discards its browsing context and re-fetches its src, so it can
       never live in a subtree that paint() rewrites. party-host.js registers this with the
       run frame's client rect every frame. */
    .run-cam-layer { position:fixed; z-index:5; overflow:hidden; border-radius:12px;
      background:var(--night-deep); box-shadow: inset 0 0 60px rgba(0,0,0,.5);
      opacity:0; transition: opacity .8s ease; pointer-events:none; }
    .run-cam-layer.live { opacity:1; }
    .run-cam-layer[hidden] { display:none; }
    .run-cam-layer iframe.run-cam { width:100%; height:100%; border:0; display:block;
      background:var(--night-deep); }
    /* 🔥 THE WARM PLACEMENT — full-bleed, BEHIND the lobby, and dimmed rather than hidden.
       'display:none' and 'visibility:hidden' both let a browser throttle rAF in a same-origin
       iframe, which would pause the bake the whole slice exists to start early. So the mansion is
       always composited and simply turned down by the scrim below: if the join code is not the
       most legible thing on this screen, that scrim is wrong. */
    .run-cam-layer.warm { z-index:0; border-radius:0; box-shadow:none;
      opacity:0; filter: blur(2px) saturate(.85); }
    .run-cam-layer.warm.live { opacity:1; }
    /* 🎬 INTROS — a centred picture, not the dim full-bleed strip CASTING used to leave.
       Same layer as the run camera (z-index 5, no blur) so the Meshy body is the thing in
       frame rather than wallpaper behind a ballot board. */
    .run-cam-layer.intros { z-index:5; border-radius:12px; filter:none;
      opacity:0; box-shadow: inset 0 0 60px rgba(0,0,0,.5); }
    .run-cam-layer.intros.live { opacity:1; }
    .night.on-intro .night-top { padding:8px 22px 4px; }
    .night.on-intro .night-line { display:none; }
    .night.on-intro .night-main { padding:0 16px 10px; overflow:hidden;
      display:flex; flex-direction:column; justify-content:center; }
    .intro-frame { position:relative;
      height:min(${INTRO_FRAME_PCT}vh, calc(${INTRO_FRAME_PCT}vw * 9 / 16)); aspect-ratio:16/9; width:auto;
      max-width:100%; margin:0 auto; display:flex;
      align-items:center; justify-content:center;
      border:2px solid rgba(var(--night-accent-rgb), .45); border-radius:14px; overflow:hidden;
      background:var(--night-deep); }
    .intro-hint { text-align:center; color:var(--night-dim); font-size:13px;
      letter-spacing:.16em; text-transform:uppercase; margin-top:8px; }
    /* Talk beats (debrief / reckoning / vote / execution / recap / post-walk casting):
       the ballroom is the picture. Chrome sits in reserved bands around it so the
       seated chairs cannot cover text. Recap used to blank the 3D feed with a fact
       card — it now uses the same talk well. No backticks in this comment. */
    .night.on-talk .night-top, .night.on-recap .night-top { padding:8px 22px 4px; }
    .night.on-talk .night-line, .night.on-recap .night-line { display:none; }
    .night.on-talk .night-main, .night.on-recap .night-main { padding:0 16px 10px; overflow:hidden;
      display:flex; flex-direction:column; min-height:0; }
    .night.on-recap .actions { margin-top:8px; flex:0 0 auto; }
    .night.on-recap .actions .btn { padding:8px 14px; font-size:12px; }
    .night.on-recap .hint.spaced { margin-top:8px; }
    .talk-stage { position:relative; display:flex; flex-direction:column; align-items:stretch;
      width:100%; height:100%; min-height:0; flex:1; pointer-events:none; }
    .night.on-talk .intro-frame.talk-frame { height:100%; width:100%; max-width:100%;
      max-height:100%; aspect-ratio:auto; margin:0; }
    .recap-mini { align-self:flex-start; display:flex; flex-wrap:wrap; gap:6px 12px;
      padding:6px 10px; border-radius:6px; background:rgba(12,10,8,.72);
      border:1px solid rgba(var(--night-accent-rgb), .28); font-size:12px;
      letter-spacing:.14em; text-transform:uppercase; font-weight:700; }
    .recap-mini .mini-v.ok { color:var(--night-live); }
    .recap-mini .mini-v.bad { color:var(--night-bad); }
    .talk-clock { align-self:flex-end; font-size:clamp(32px, 5vw, 56px); font-weight:800;
      line-height:1; font-variant-numeric:tabular-nums; color:var(--night-ink);
      text-shadow:0 4px 24px rgba(0,0,0,.85); }
    ${SHOW_CHROME_CSS}
    .phone .talk-clock, .phone-clock { font-size:clamp(36px, 14vw, 64px); align-self:flex-start;
      text-shadow:none; margin:8px 0 12px; }
    .talk-kicker { margin:4px 0 0; text-align:left; color:var(--night-dim); font-size:12px;
      letter-spacing:.12em; text-transform:uppercase; }
    .nom-board { margin-top:0; display:flex; flex-direction:column; gap:6px; max-width:none; }
    .nom-row { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center;
      padding:8px 10px; border-radius:6px; background:rgba(18,14,10,.82);
      border:1px solid rgba(var(--night-accent-rgb), .2); }
    .nom-n { color:var(--night-accent); font-weight:800; letter-spacing:.16em; font-size:12px; }
    .nom-who { font-size:clamp(16px, 2vw, 24px); font-weight:800; line-height:1.05; }
    .nom-by { color:var(--night-dim); font-size:11px; letter-spacing:.1em; text-transform:uppercase; }
    /* '.night' is opaque by design — it is the show's own black. While the mansion is warming
       behind it, it becomes a scrim instead, and 'party-host.js' sets 'rrr-warming' on <body> only
       once the layer is live so the lobby never fades toward a frame that has not rendered. */
    body.rrr-warming .night { background:
      radial-gradient(900px 520px at 50% -8%, rgba(var(--night-accent-rgb), .10), transparent 58%),
      linear-gradient(180deg, rgba(12,10,8,.86) 0%, rgba(12,10,8,.46) 46%, rgba(12,10,8,.88) 100%); }
    body.rrr-warming .night-main { text-shadow: 0 2px 18px rgba(0,0,0,.85); }
    /* 📊 The indicator itself. 'warm-fill' is the only thing that moves, and party-host.js patches
       its width in place rather than repainting the lobby for a percentage. */
    .warm { margin-top:22px; max-width:520px; }
    .warm-text { color:var(--night-dim); font-size:12px; letter-spacing:.2em;
      text-transform:uppercase; margin-bottom:8px; }
    .warm-track { height:6px; border-radius:3px; overflow:hidden;
      background:rgba(var(--night-accent-rgb), .14); }
    .warm-fill { height:100%; width:0; border-radius:3px; background:var(--night-accent);
      transition: width .6s cubic-bezier(.22,.61,.36,1); }
    .warm.ready .warm-text { color:var(--night-live); }
    .warm.ready .warm-fill { background:var(--night-live); }
    .run-slate { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      transition: opacity .8s ease; pointer-events:none; }
    .run-frame.live .run-slate { opacity:0; }
    .run-frame.live { border-color:rgba(var(--night-accent-rgb), .55); }
    .run-follow { display:flex; flex-direction:column; align-items:center; gap:14px; padding:28px 20px; }
    .run-face { filter: drop-shadow(0 16px 36px rgba(245,161,74,.28)); animation: night-breathe 2.4s ease-in-out infinite; }
    .run-face .bot-face { width:min(42vw, 220px); height:auto; }
    .run-tag { font-size:clamp(28px, 5vw, 56px); font-weight:800; letter-spacing:.04em; color:#f3ece3; }
    .run-slot { letter-spacing:.28em; text-transform:uppercase; color:#f5a14a; font-size:13px; font-weight:700; }
    .phone { padding:16px 16px 24px; overflow:auto; }
    .phone-top { display:flex; justify-content:space-between; color:#8a7d70; font-size:12px;
      letter-spacing:.16em; text-transform:uppercase; margin-bottom:14px; }
    .phone h1 { font-size:28px; margin:0 0 8px; letter-spacing:.04em; line-height:1.2; }
    .field { width:100%; padding:14px 12px; border-radius:6px; border:1px solid rgba(245,161,74,.25);
      background:#161310; color:#fff; font:inherit; font-size:20px; letter-spacing:.08em; margin:8px 0 14px; }
    .field.code { text-transform:uppercase; letter-spacing:.28em; }
    .role-card { margin:12px 0; padding:28px 22px; border-radius:12px; background:#161310;
      border:1px solid rgba(245,161,74,.25); min-height:200px; }
    .role-card .role { font-size:34px; font-weight:800; }
    .role-card .side { margin-top:10px; letter-spacing:.2em; font-size:18px; }
    .role-card .rule { margin-top:16px; color:#d8cbb8; font-size:20px; line-height:1.35; }
    .pad { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
    .pad button { min-height:100px; font-size:18px; letter-spacing:.1em; text-transform:uppercase;
      font-weight:700; border:0; border-radius:10px; background:#1c1712; color:#f3ece3; }
    .pad button.on { background:#f5a14a; color:#1a1208; }
    /* 👏 THE REACTION PAD. Each button carries the player's own face wearing that reaction, so a
       thumb picks a picture rather than a word — and the picture is what the TV is about to show.
       Two columns of 100px targets, well past the 44px floor, because this is tapped in the dark
       while the player is watching the television and not the phone. */
    .react-pad button { display:flex; align-items:center; justify-content:flex-start; gap:14px;
      padding:10px 16px; text-align:left; transition: transform .12s ease, opacity .2s ease; }
    .react-pad button .bot-face { flex:0 0 auto; }
    .react-pad button:active { transform: scale(.96); background:#241f1a; }
    /* The local cooldown is FEEL only — the server keeps the clock that counts. Dimmed rather
       than disabled so the four faces stay legible as a set while it runs. */
    .react-pad.cooling button { opacity:.45; pointer-events:none; }
    .pick-list { display:flex; flex-direction:column; gap:8px; margin:8px 0 16px; }
    .pick-list button { text-align:left; padding:14px 16px; border-radius:8px; border:1px solid rgba(245,161,74,.2);
      background:#161310; color:#f3ece3; font-size:18px; font-weight:700;
      transition: border-color .25s ease, background .25s ease, transform .2s ease, opacity .25s ease; }
    .pick-list button.on { border-color:#f5a14a; background:#3a2614; transform: scale(1.01); }
    .pick-list button.self-pick { border-color:#e8c36a; box-shadow: inset 0 0 0 1px rgba(232,195,106,.5); }
    .pick-list button.locked-out,
    .pick-list button.locked-out:disabled {
      opacity:1; cursor:not-allowed; pointer-events:none; transform:none;
      background:#0e0c0a; color:#6a5f54; border-color:rgba(138,125,112,.28);
      border-style:dashed; -webkit-tap-highlight-color:transparent;
      box-shadow:none; filter:none; }
    .pick-list button.locked-out.on,
    .pick-list button.locked-out:active,
    .pick-list button.locked-out:hover {
      transform:none; background:#0e0c0a; border-color:rgba(138,125,112,.28); }
    .cast-note { min-height:20px; margin:0 0 8px; color:#e8c36a; font-size:14px;
      font-weight:700; line-height:1.35; }
    .cast-note[hidden] { visibility:hidden; display:block; }
    .cast-step { animation: night-rise .4s ease; }
    .lock-slot { margin-top:8px; min-height:58px; }
    .lock-slot[hidden] { display:none; }
    .lock-btn { display:flex; align-items:center; justify-content:center; gap:10px; }
    .lock-btn .padlock { width:22px; height:22px; flex:0 0 auto; }
    .lock-btn.in { animation: night-rise .4s ease; }
    .hint { color:#8a7d70; font-size:14px; line-height:1.45; }
    .bot-face { display:block; }
    /* Every coloured part of the face carries data-paint / data-stroke, so the picker's
       cross-fade follows the drawing instead of naming two elements that no longer exist. */
    .bot-face [data-paint], .bot-face [data-stroke] {
      transition: fill .4s ease, stroke .4s ease; }
    .look-stage { display:flex; flex-direction:column; align-items:center; gap:10px;
      padding:12px 0 8px; animation: night-rise .45s ease; }
    .look-stage .bot-face { width:min(42vw, 168px); height:auto; filter: drop-shadow(0 10px 24px rgba(245,161,74,.18)); }
    .look-stage.connecting .bot-face { animation: night-breathe 1.6s ease-in-out infinite; }
    /* 🎨 TWELVE COLOURS IN THE HEIGHT SIX USED TO TAKE. John asked for more colours AND a phone UI
       that does not eat the screen, and 'flex-wrap:wrap' cannot do both — twelve 36 px swatches
       wrap onto a second line and the picker grows by 46 px per row, twice. One scrolling line
       instead: 30 px swatches, 7 px gaps, snap points so a flick lands on a colour rather than
       between two. 12 x 37 = 444 px of strip, which scrolls on a 390 pt phone and fits outright
       on anything wider. The row is 40 px tall at both six colours and twelve. */
    .swatch-row { display:flex; gap:7px; margin:4px 0 12px; padding:2px 2px 6px;
      overflow-x:auto; overflow-y:hidden; scroll-snap-type: x proximity;
      -webkit-overflow-scrolling:touch; scrollbar-width:none; }
    .swatch-row::-webkit-scrollbar { display:none; }
    .swatch { width:30px; height:30px; flex:0 0 auto; scroll-snap-align:center;
      border-radius:50%; border:2px solid transparent; padding:0;
      cursor:pointer; background: var(--swatch); box-shadow: inset 0 0 0 1px rgba(0,0,0,.35);
      transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
    .swatch.on { transform: scale(1.12); border-color:#f3ece3; box-shadow: 0 0 0 3px rgba(245,161,74,.35); }

    /* 🕹️ THE RUNNER'S PAD. Two sticks — left walks into the TV chase, right orbits it —
       plus RUN and SWING. 'touch-action:none' is not optional: without it the browser claims
       the drag as a scroll and the stick receives one pointermove and then nothing. */
    .stick-wrap { display:grid; grid-template-columns: minmax(96px,1fr) auto minmax(96px,1fr);
      gap:10px; align-items:end; margin-top:14px; }
    .stick-col { display:flex; flex-direction:column; align-items:center; gap:6px; min-width:0; }
    .stick { position:relative; width:100%; aspect-ratio:1/1; max-width:168px; border-radius:50%;
      background: radial-gradient(circle at 50% 50%, var(--night-panel) 0%, var(--night-well) 72%);
      border:1px solid rgba(var(--night-accent-rgb), .28); touch-action:none; user-select:none; }
    .stick-look { border-color: rgba(var(--night-accent-rgb), .55); }
    .stick .nub { position:absolute; left:50%; top:50%; width:38%; height:38%; border-radius:50%;
      transform: translate(-50%, -50%); background:var(--night-accent);
      box-shadow: 0 6px 18px rgba(0,0,0,.55); transition: background .2s ease; }
    .stick.on .nub { background:var(--night-ink); }
    .stick-cap { font-size:11px; letter-spacing:.2em; text-transform:uppercase;
      color:var(--night-dim); font-weight:700; }
    /* 🎥 THE TOP-DOWN PAD. The look stick is gone — a plan-locked map has nothing to swing — so
       the two columns share the width and RUN / SWING grow into the half it leaves behind. The
       stick stays in its own corner rather than centring: moving it would undo the thumb's
       learned position at the exact moment the player is being asked to relearn the mapping. */
    .stick-wrap.top { grid-template-columns: minmax(120px,1.15fr) 1fr; }
    .stick-wrap.top .stick { max-width:200px; }
    .stick-wrap.top .stick-side { justify-content:flex-end; }
    .stick-wrap.top .stick-btn { min-height:96px; font-size:17px; }
    .stick-side { display:flex; flex-direction:column; gap:10px; }
    .stick-btn { appearance:none; border:0; font:inherit; font-weight:700; letter-spacing:.12em;
      text-transform:uppercase; border-radius:12px; padding:0 12px; min-height:62px; min-width:76px;
      background:var(--night-panel); color:var(--night-ink); touch-action:none;
      border:1px solid rgba(var(--night-accent-rgb), .28); }
    .stick-btn.on { background:var(--night-accent); color:var(--night-deep); }
    .stick-btn.swing.on { background:var(--night-bad); }
    /* 🔨 THE PAD'S OWN ANSWER TO A SWING. The button's .on flash is under the thumb that is
       covering it, so it confirms nothing to the person who tapped it — this line sits clear of
       both the stick and the buttons.
       ⚠️ The height is RESERVED, exactly as .intel below reserves its own and for the same
       reason: a line that appears and vanishes twice a swing would shove the stick under the
       player's thumb mid-drag. It fades, it never takes or gives back layout. */
    .pad-fx { min-height:24px; margin-top:10px; text-align:center; font-weight:800;
      letter-spacing:.22em; text-transform:uppercase; font-size:15px; line-height:24px;
      color:var(--night-accent); opacity:0; transition: opacity .14s ease; }
    .pad-fx.on { opacity:1; }
    .pad-fx.smash { color:var(--night-bad); }
    /* The slot is ALWAYS present and always this tall, whether it is speaking or not. A good
       player's read is sporadic by design (intel.js drops one in three), and an element that
       comes and goes twice a second moves the stick under the player's thumb. Reserving the
       height is what makes 'sporadic information' a property of the TEXT rather than of the
       layout. */
    .intel { margin-top:12px; padding:12px 14px; border-radius:10px; background:var(--night-panel);
      border:1px solid rgba(var(--night-accent-rgb), .2); font-size:16px; line-height:1.35;
      min-height:66px; transition: border-color .3s ease; }
    .intel.exact { border-color:var(--night-bad); color:var(--night-ink); }
    .intel .k { display:block; color:var(--night-dim); font-size:11px; letter-spacing:.2em;
      text-transform:uppercase; margin-bottom:5px; }
    /* 🔴 PRODUCTION FEED is the strip John named as the red to match, and it was reading in the
       same grey as WORD FROM THE HOUSE — only the border was red. The words carry it now, and
       'rolecard.js' takes the same token, so the two Production surfaces are one colour. */
    .intel.exact .k { color:var(--night-bad); }
    .goal { margin-top:10px; color:var(--night-live); font-size:16px; font-weight:700; }
    .here { margin: 8px 0 2px; color: var(--night-ink); font-size: 18px; font-weight: 700; letter-spacing: .02em; }
    .here strong[data-here] { color: var(--night-live); }
    ${GUIDE_MAP_CSS}
    @keyframes night-rise { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
    @keyframes night-breathe { 0%,100% { opacity:.55; } 50% { opacity:1; } }
    @media (max-width:720px) {
      .night-top, .night-line, .night-main, .show-rail { padding-left:16px; padding-right:16px; }
      .seats { grid-template-columns:repeat(2, 1fr); }
      .ballot .row { grid-template-columns:1fr; }
      .ballot .pick { text-align:left; }
    }
    ${ROLE_CARD_CSS}
  `;
  document.head.appendChild(s);
}

export function markPartyReady() {
  document.body.dataset.rrrReady = '1';
  window.__rrr = window.__rrr || {
    ready: true,
    settle: async () => {},
    perf: () => ({}),
    simState: () => ({}),
    freeRun: () => {},
    engine: { resetPerf() {} },
  };
  window.__rrr.ready = true;
}
