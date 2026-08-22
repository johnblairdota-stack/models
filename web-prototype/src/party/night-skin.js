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
    .night { position:fixed; inset:0; color:#f3ece3; font-family: ui-sans-serif, system-ui, sans-serif;
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
    .actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:22px; }
    .err { color:#ff8a7a; white-space:pre-wrap; font-family:ui-monospace,Menlo,monospace; font-size:13px; }
    .ballot { display:flex; flex-direction:column; gap:14px; }
    .ballot .row { display:grid; grid-template-columns: 1fr auto 1fr; gap:20px; align-items:center;
      padding:22px 26px; background:rgba(18,14,10,.8); border:1px solid rgba(245,161,74,.16); border-radius:8px; }
    .ballot .who { font-size:clamp(40px, 7vw, 84px); font-weight:800; line-height:1; }
    .ballot .pick { font-size:clamp(36px, 6vw, 72px); font-weight:800; text-align:right; line-height:1.1; }
    .ballot.huge .who { font-size:clamp(52px, 9vw, 96px); }
    .ballot.huge .pick { font-size:clamp(44px, 8vw, 84px); }
    .ballot .arrow { color:#f5a14a; letter-spacing:.2em; font-size:18px; text-transform:uppercase; }
    .pair-hero { margin:18px 0 8px; font-size:clamp(48px, 10vw, 120px); font-weight:800; line-height:1.1; }
    /* THE FRAME IS THE SHOW, SO THE FRAME GETS THE SCREEN. PR #5 gave the pair-hero the whole
       lower half because there was nothing else on the TV during the run — a still and two names.
       With a live camera in the frame that split is backwards: the first drive photographed a
       1024x215 letterbox strip with the runner four storeys of type below it. The hero is now a
       strapline under the picture, and the picture takes the height. */
    .run-stage { display:flex; flex-direction:column; gap:6px; }
    .run-stage .pair-hero { margin:12px 0 2px; font-size:clamp(24px, 3.6vw, 56px); line-height:1.05;
      text-align:center; }
    .run-stage .pair-hero br { display:none; }
    .run-stage .night-line { font-size:15px; text-align:center; max-width:none; }
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
       then sit inside a 16:9 frame, which is what a broadcast crop actually looks like. */
    .run-frame { position:relative; height:min(58vh, 620px); aspect-ratio:16/9; width:auto;
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
    .run-mount { position:absolute; inset:0; }
    .run-slate { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      transition: opacity .8s ease; pointer-events:none; }
    .run-frame.live .run-slate { opacity:0; }
    .run-frame.live { border-color:rgba(var(--night-accent-rgb), .55); }
    .run-follow { display:flex; flex-direction:column; align-items:center; gap:14px; padding:28px 20px; }
    .run-face { filter: drop-shadow(0 16px 36px rgba(245,161,74,.28)); animation: night-breathe 2.4s ease-in-out infinite; }
    .run-face .bot-face { width:min(42vw, 220px); height:auto; }
    .run-tag { font-size:clamp(28px, 5vw, 56px); font-weight:800; letter-spacing:.04em; color:#f3ece3; }
    .run-slot { letter-spacing:.28em; text-transform:uppercase; color:#f5a14a; font-size:13px; font-weight:700; }
    .recap { display:grid; grid-template-columns:1fr; gap:16px; max-width:900px; }
    .recap .fact { padding:28px 30px; border-radius:10px; background:rgba(18,14,10,.85);
      border:1px solid rgba(245,161,74,.2); }
    .recap .k { letter-spacing:.22em; text-transform:uppercase; color:#f5a14a; font-size:14px; }
    .recap .v { font-size:clamp(40px, 8vw, 84px); font-weight:800; line-height:1; margin-top:8px; }
    .recap .v.bad { color:#ff8a7a; }
    .recap .v.ok { color:#9ff2c8; }
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
    .pick-list { display:flex; flex-direction:column; gap:8px; margin:8px 0 16px; }
    .pick-list button { text-align:left; padding:14px 16px; border-radius:8px; border:1px solid rgba(245,161,74,.2);
      background:#161310; color:#f3ece3; font-size:18px; font-weight:700;
      transition: border-color .25s ease, background .25s ease, transform .2s ease, opacity .25s ease; }
    .pick-list button.on { border-color:#f5a14a; background:#3a2614; transform: scale(1.01); }
    .pick-list button.locked-out { opacity:.4; cursor:not-allowed; }
    .cast-step { animation: night-rise .4s ease; }
    .lock-slot { margin-top:8px; min-height:58px; }
    .lock-slot[hidden] { display:none; }
    .lock-btn { display:flex; align-items:center; justify-content:center; gap:10px; }
    .lock-btn .padlock { width:22px; height:22px; flex:0 0 auto; }
    .lock-btn.in { animation: night-rise .4s ease; }
    .hint { color:#8a7d70; font-size:14px; line-height:1.45; }
    .bot-face { display:block; }
    .bot-shell, .bot-wedge { transition: fill .4s ease; }
    .look-stage { display:flex; flex-direction:column; align-items:center; gap:10px;
      padding:12px 0 8px; animation: night-rise .45s ease; }
    .look-stage .bot-face { width:min(42vw, 168px); height:auto; filter: drop-shadow(0 10px 24px rgba(245,161,74,.18)); }
    .look-stage.connecting .bot-face { animation: night-breathe 1.6s ease-in-out infinite; }
    .swatch-row { display:flex; gap:10px; flex-wrap:wrap; margin:4px 0 14px; }
    .swatch { width:36px; height:36px; border-radius:50%; border:2px solid transparent; padding:0;
      cursor:pointer; background: var(--swatch); box-shadow: inset 0 0 0 1px rgba(0,0,0,.35);
      transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
    .swatch.on { transform: scale(1.08); border-color:#f3ece3; box-shadow: 0 0 0 3px rgba(245,161,74,.35); }
    @keyframes night-rise { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
    @keyframes night-breathe { 0%,100% { opacity:.55; } 50% { opacity:1; } }
    @media (max-width:720px) {
      .night-top, .night-line, .night-main { padding-left:16px; padding-right:16px; }
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
