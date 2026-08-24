/**
 * Public lobby cosmetics — a face, two colours. Not a role, not a deal.
 *
 * Closed palettes so a phone cannot smuggle a string through `shell` / `accent`.
 * The face is one SVG (Grok-Bot wedge energy, not a second 3D pipeline).
 */

import { RUNDOWN_BEATS, SHOW_BEATS, railDrainPct, rundownRibbon } from './show.js';

/**
 * 🎨 **TWELVE AND TWELVE, AND THE FIRST SIX ARE FROZEN IN PLACE.**
 *
 * John, after the D13 playtest: *"More colours for the face/shell picker, but keep the phone UI
 * slim (don't eat the screen)."* Both halves of that sentence are constraints and the second one
 * is the harder: `night-skin.js`'s `.swatch-row` answers it by scrolling on one line rather than
 * wrapping onto a second, so twelve colours occupy exactly the height six did. If the picker got
 * taller, this change was done wrong.
 *
 * 🚨 **APPEND ONLY. NEVER REORDER, NEVER REPLACE.** `cleanLook()` below validates by VALUE against
 * these arrays and `party-phone.js` restores a saved look out of `localStorage` — so dropping or
 * moving one of the original six silently resets every returning player in the room to the default
 * on the night it ships. `harness/party-warm.mjs` W9b pins the first six at their original indices
 * for exactly that reason.
 *
 * The second six stay inside the night's own register — no primaries, nothing that would fight the
 * `--night-accent` amber the rest of the show is lit with. They are a wider spread of the same
 * house, not a brighter one.
 */
export const SHELLS = [
  '#2a2420', '#c4b4a0', '#6b3a2a', '#1e3330', '#3d2a38', '#2f3320',
  '#1c2a3a', '#5c2733', '#8a6f45', '#3a3a3d', '#243d2c', '#6a5a7a',
];
export const ACCENTS = [
  '#f5a14a', '#e8d5a3', '#ff7a59', '#f0ebe3', '#c47a4a', '#9ad7c2',
  '#7fb3e8', '#e5c04a', '#d95a8a', '#a8c66c', '#4fb8c9', '#c9a0dc',
];
export const DEFAULT_LOOK = { shell: SHELLS[0], accent: ACCENTS[0] };

export function cleanLook(input) {
  const shell = SHELLS.includes(input?.shell) ? input.shell : null;
  const accent = ACCENTS.includes(input?.accent) ? input.accent : null;
  if (!shell || !accent) return null;
  return { shell, accent };
}

/** Four-letter room alphabet — no i/l/o/0/1. Same set `makeCode` already uses. */
export const CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
export const CODE_ABC_DISPLAY = CODE_ABC.toUpperCase();

/** What the join field must show: CAPS, no spaces, alphabet only. */
export function normalizeCodeDisplay(raw) {
  const allow = new Set(CODE_ABC_DISPLAY);
  let out = '';
  for (const ch of String(raw ?? '').toUpperCase()) {
    if (ch === ' ' || ch === '\t' || ch === '\n') continue;
    if (allow.has(ch)) out += ch;
  }
  return out.slice(0, 8);
}

/** Wire / URL form stays lowercase, matching `makeCode` and `?room=`. */
export function normalizeCodeWire(raw) {
  return normalizeCodeDisplay(raw).toLowerCase();
}

/**
 * Small robot face. `shell` is the helmet; `accent` is the wedge visor.
 * No element ids — the TV lobby mounts one per chair.
 */
export function robotFaceSvg(shell = DEFAULT_LOOK.shell, accent = DEFAULT_LOOK.accent, { size = 120 } = {}) {
  const s = cleanLook({ shell, accent }) || DEFAULT_LOOK;
  return `<svg class="bot-face" viewBox="0 0 80 80" width="${size}" height="${size}" aria-hidden="true">
    <path class="bot-shell" fill="${s.shell}" d="M40 7C55 7 67 18 67 34v15c0 17-14 25-27 25S13 66 13 49V34C13 18 25 7 40 7z"/>
    <path class="bot-wedge" fill="${s.accent}" d="M40 18l20 17-20 24L20 35z"/>
    <rect class="bot-eye" x="29.5" y="33" width="6.5" height="4.2" rx="2.1" fill="#1a120c"/>
    <rect class="bot-eye" x="44" y="33" width="6.5" height="4.2" rx="2.1" fill="#1a120c"/>
  </svg>`;
}

/**
 * Broadcast chrome — tokens and HTML the TV and the phone share.
 *
 * The chase overlay in party-follow.js is the look the room already trusts (REC, lower-third,
 * letterbox). Host paint used to restyle each beat with inline leftovers. These builders are
 * the one language: title plate, join-code bug, nameplate, countdown, verdict plate.
 *
 * CSS lives here so a bare-node gate can walk it, same as ROLE_CARD_CSS / FOLLOW_CHROME_CSS.
 * night-skin.js interpolates the block. No colour literals except photographic black.
 * No backticks in the comment inside the CSS string.
 */
export const SHOW_TITLE = 'PRIME TIME';
export const SHOW_LINE = 'Two of you go in. One walks, one talks. The rest of us watch. Someone in this room is lying.';

/** Camera bug per show beat. Expedition stays CAM 01 to match follow.js CAM_LABEL. */
export const SHOW_CAM = {
  lobby: 'RRR CAM 00',
  casting: 'RRR CAM 00',
  expedition: 'RRR CAM 01',
  recap: 'RRR CAM 02',
  debrief: 'RRR CAM 02',
  reckoning: 'RRR CAM 03',
  vote: 'RRR CAM 03',
  execution: 'RRR CAM 03',
};

export function showCam(beat) {
  return SHOW_CAM[String(beat || '')] || SHOW_CAM.lobby;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function recBugHtml({ cam = SHOW_CAM.lobby } = {}) {
  return `<div class="show-rec" aria-hidden="true"><span class="show-dot"></span><span>${escHtml(cam)}</span></div>`;
}

export function nameplateHtml({ name, sub = '', face = '' } = {}) {
  return `<div class="show-third">
    ${face ? `<div class="face">${face}</div>` : ''}
    <div>
      <div class="who">${escHtml(name)}</div>
      ${sub ? `<div class="sub">${escHtml(sub)}</div>` : ''}
    </div>
  </div>`;
}

export function titlePlateHtml({ title = SHOW_TITLE, line = SHOW_LINE } = {}) {
  return `<div class="show-title">
    <div class="show-title-name">${escHtml(title)}</div>
    <div class="show-title-line">${escHtml(line)}</div>
  </div>`;
}

export function codeBugHtml({ code, url = '', sub = 'room code · phones scan the qr' } = {}) {
  return `<div class="show-bug">
    <div class="show-bug-k">live · join</div>
    <div class="night-code">${escHtml(code)}</div>
    <div class="night-sub">${escHtml(sub)}</div>
    ${url ? `<div class="night-url">${escHtml(url)}</div>` : ''}
  </div>`;
}

export function countdownHtml({ clock, label = '' } = {}) {
  if (!clock) return '';
  return `<div class="show-clock">
    ${label ? `<div class="show-clock-k">${escHtml(label)}</div>` : ''}
    <div class="talk-clock" data-show-clock>${escHtml(clock)}</div>
  </div>`;
}

export function verdictPlateHtml({ kicker = 'VERDICT READY', line, sub = '' } = {}) {
  return `<div class="show-verdict">
    <div class="show-verdict-k">${escHtml(kicker)}</div>
    <div class="show-verdict-v">${escHtml(line)}</div>
    ${sub ? `<div class="show-verdict-s">${escHtml(sub)}</div>` : ''}
  </div>`;
}

/**
 * Direction B — the shooting schedule across the top of the TV.
 *
 * `phases.js` / live SHOW beats ARE the schedule. Current beat is lit; its bar drains
 * with `show.until` when the server published one. Expedition / chase is a ~22px ribbon
 * so the picture stays king. Lobby and talk beats open the labels.
 */
export function rundownRailHtml({
  beat = 'lobby',
  until = null,
  holdMs = null,
  ribbon = false,
  now = Date.now(),
  beats = RUNDOWN_BEATS,
} = {}) {
  const current = String(beat || 'lobby').toLowerCase();
  const idx = beats.indexOf(current);
  const drain = railDrainPct(until, holdMs, now);
  const fillPct = drain == null ? 100 : drain;
  const holdAttr = Number.isFinite(holdMs) && holdMs > 0 ? String(holdMs) : '';
  const mode = ribbon || rundownRibbon(current) ? 'ribbon' : 'open';
  const segs = beats.map((id, i) => {
    const live = SHOW_BEATS.includes(id);
    const state = i === idx ? 'on' : (i < idx ? 'past' : (live ? 'next' : 'stub'));
    const fill = i === idx
      ? `<div class="show-rail-fill" data-rail-drain data-rail-hold="${escHtml(holdAttr)}" style="width:${fillPct}%"></div>`
      : '';
    return `<div class="show-rail-seg ${state}" data-rail-seg="${escHtml(id)}"${i === idx ? ' aria-current="step"' : ''}>
      <div class="show-rail-k">${escHtml(id)}</div>
      <div class="show-rail-track">${fill}</div>
    </div>`;
  }).join('');
  return `<nav class="show-rail ${mode}" data-show-rail data-beat="${escHtml(current)}" aria-label="Night rundown">${segs}</nav>`;
}

export const SHOW_CHROME_CSS = `
    /* Shared show dressing. Photographic black only — matte, plate, shadow. */
    .show-rec { display:flex; align-items:center; gap:9px; letter-spacing:.24em;
      text-transform:uppercase; font-size:12px; font-weight:700; color:var(--night-ink); }
    .show-dot { width:11px; height:11px; border-radius:50%; background:var(--night-bad);
      box-shadow:0 0 12px var(--night-bad); animation: fl-rec 2s ease-in-out infinite; }
    .night-brand-row { display:flex; align-items:center; gap:14px; }
    .show-title { margin:0 0 18px; max-width:46rem; }
    .show-title-name { font-size:clamp(28px, 5vw, 56px); font-weight:800; letter-spacing:.2em;
      text-transform:uppercase; color:var(--night-accent); line-height:1; }
    .show-title-name::before { content:''; display:inline-block; width:12px; height:12px;
      margin-right:14px; vertical-align:0.12em; background:var(--night-accent); transform:rotate(45deg); }
    .show-title-line { margin-top:10px; color:var(--night-soft); font-size:16px; letter-spacing:.02em;
      line-height:1.4; }
    .show-bug { padding:14px 18px 12px; border:1px solid rgba(var(--night-accent-rgb), .35);
      background:rgba(0,0,0,.45); border-radius:0 14px 14px 0; min-width:min(100%, 22rem); }
    .show-bug-k { color:var(--night-accent); font-size:11px; letter-spacing:.26em;
      text-transform:uppercase; font-weight:700; margin-bottom:8px; }
    .night-url { margin-top:12px; color:var(--night-dim); font-size:12px; letter-spacing:.03em;
      text-transform:none; max-width:28rem; word-break:break-all; }
    .hint.spaced { margin-top:16px; }
    .hint.live-hint { margin-top:14px; }
    .hint.waiting { margin-top:22px; }
    .show-third { display:flex; align-items:flex-end; gap:14px;
      padding:10px 22px 10px 10px; background:rgba(0,0,0,.62); border-radius:0 12px 12px 0;
      max-width:min(100%, 36rem); }
    .show-third .face { width:64px; height:64px; flex:0 0 auto;
      filter: drop-shadow(0 8px 20px rgba(0,0,0,.8)); }
    .show-third .face .bot-face { width:64px; height:64px; }
    .show-third .who { font-size:clamp(28px, 4.4vw, 56px); font-weight:800; line-height:.98;
      color:var(--night-ink); text-shadow:0 3px 18px rgba(0,0,0,.95); }
    .show-third .sub { margin-top:6px; font-size:12px; letter-spacing:.26em; text-transform:uppercase;
      color:var(--night-accent); text-shadow:0 2px 10px rgba(0,0,0,.9); }
    .show-clock { display:flex; flex-direction:column; align-items:flex-end; text-align:right; }
    .show-clock-k { color:var(--night-accent); font-size:11px; letter-spacing:.22em;
      text-transform:uppercase; font-weight:700; margin-bottom:2px; }
    .show-clock .talk-clock { font-size:clamp(32px, 5vw, 56px); }
    /* Talk chrome lives in reserved bands around the ballroom well — never inset over the
       3D layer. The follow canvas is a body-level z-index 5 plate; night is z-index 1, so
       any overlay that shares the frame rect is under the chairs. No backticks in this comment. */
    .talk-chrome-top { display:flex; justify-content:space-between; align-items:flex-start;
      gap:12px; width:100%; flex:0 0 auto; padding:0 0 8px; }
    .talk-chrome-bot { display:flex; flex-direction:column; align-items:flex-start; gap:6px;
      width:100%; flex:0 0 auto; padding:8px 0 0; }
    .talk-well { flex:1 1 auto; min-height:0; display:flex; flex-direction:row;
      align-items:stretch; gap:12px; width:100%; }
    .talk-picture { flex:1 1 auto; min-width:0; min-height:0;
      display:flex; align-items:center; justify-content:center; }
    .talk-side { flex:0 0 min(26%, 280px); min-width:168px; max-width:300px;
      min-height:0; overflow:hidden; display:flex; flex-direction:column; gap:6px; }
    .show-verdict { margin:0; padding:10px 14px; border:2px solid rgba(var(--night-accent-rgb), .55);
      background:rgba(0,0,0,.72); border-radius:4px 14px 4px 4px; max-width:min(100%, 42rem); }
    .show-verdict-k { color:var(--night-accent); font-size:11px; letter-spacing:.24em;
      text-transform:uppercase; font-weight:800; }
    .show-verdict-v { margin-top:4px; font-size:clamp(18px, 2.6vw, 32px); font-weight:800;
      line-height:1.05; color:var(--night-ink); text-transform:uppercase; }
    .show-verdict-s { margin-top:4px; color:var(--night-dim); font-size:11px; letter-spacing:.14em;
      text-transform:uppercase; }
    .show-tally { display:flex; flex-wrap:wrap; gap:6px 10px; margin-top:0; }
    .show-tally-row { display:flex; align-items:baseline; gap:8px;
      padding:6px 10px; background:rgba(0,0,0,.55); border-radius:6px;
      border:1px solid rgba(var(--night-accent-rgb), .22); }
    .show-tally-row .who { font-size:clamp(14px, 1.6vw, 20px); font-weight:800; }
    .show-tally-row .n { font-size:clamp(16px, 2vw, 24px); font-weight:800; color:var(--night-accent);
      font-variant-numeric:tabular-nums; }
    .nom-board { pointer-events:none; }
    .nom-row.show-nom { display:flex; align-items:center; gap:8px; padding:6px 8px; }
    .nom-row.show-nom .show-third { background:transparent; padding:0; }
    .talk-side .nom-board { margin:0; max-width:none; gap:6px; width:100%; }
    .talk-side .show-third .face, .talk-side .show-third .face .bot-face { width:40px; height:40px; }
    .talk-side .show-third .who { font-size:clamp(16px, 1.8vw, 24px); }
    .talk-chrome-bot .show-third .face, .talk-chrome-bot .show-third .face .bot-face {
      width:44px; height:44px; }
    .talk-chrome-bot .show-third .who { font-size:clamp(20px, 2.8vw, 36px); }
    .talk-chrome-bot .show-third { padding:8px 16px 8px 8px; }
    .talk-side .ballot { gap:6px; }
    .talk-side .ballot .row { padding:8px 10px; gap:10px; }
    .talk-side .ballot .who { font-size:clamp(16px, 1.8vw, 24px); }
    .talk-side .ballot .pick { font-size:clamp(13px, 1.5vw, 18px); }
    .talk-side .ballot.huge .who { font-size:clamp(18px, 2vw, 28px); }
    .talk-side .ballot.huge .pick { font-size:clamp(14px, 1.6vw, 20px); }
    .talk-side .pair-hero { font-size:clamp(16px, 2vw, 28px); margin:0 0 8px; }
    .talk-side .ballot .arrow { font-size:11px; }
    /* Recap is a lower-third strip, one 16:9 viewport, no scroll. */
    .recap-stage { width:100%; display:flex; flex-direction:column; gap:8px; }
    .recap-head { display:flex; justify-content:flex-end; align-items:flex-end; }
    .recap { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
      gap:8px; width:100%; max-width:none; }
    .recap .fact { padding:10px 14px; border-radius:8px; background:rgba(0,0,0,.62);
      border:1px solid rgba(var(--night-accent-rgb), .28); }
    .recap .k { letter-spacing:.2em; text-transform:uppercase; color:var(--night-accent); font-size:11px;
      font-weight:700; }
    .recap .v { font-size:clamp(22px, 3vw, 36px); font-weight:800; line-height:1.05; margin-top:4px; }
    .recap .v.bad { color:var(--night-bad); }
    .recap .v.ok { color:var(--night-live); }
    .night.on-recap .show-clock .talk-clock { font-size:clamp(28px, 4vw, 44px); }
    .pick-list.jackbox button { min-height:76px; font-size:clamp(22px, 7vw, 36px);
      padding:18px 20px; letter-spacing:.04em; }
    .pick-list.buzz button { animation: night-rise .35s ease; }
    .night.on-run .show-rec, .night.on-talk .show-rec, .night.on-intro .show-rec { font-size:10px; }
    .night.on-run .show-dot, .night.on-talk .show-dot { width:8px; height:8px; }
    /* Direction B rundown rail. Tokens only. No backticks in this comment. */
    .night-phase { display:flex; align-items:baseline; gap:14px; }
    .show-ep { color:var(--night-dim); font-size:12px; letter-spacing:.18em; font-weight:700; }
    .show-mast-clock { color:var(--night-ink); font-size:clamp(22px, 3vw, 36px); font-weight:800;
      letter-spacing:.04em; font-variant-numeric:tabular-nums; line-height:1; }
    .show-rail { display:flex; align-items:stretch; gap:6px; width:100%;
      padding:2px 28px 10px; pointer-events:none; }
    .show-rail-seg { flex:1 1 0; min-width:0; display:flex; flex-direction:column;
      align-items:center; justify-content:flex-end; gap:5px; }
    .show-rail-k { font-size:11px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
      color:var(--night-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      width:100%; text-align:center; line-height:1.2; }
    .show-rail-track { width:100%; height:2px; background:rgba(var(--night-accent-rgb), .16);
      overflow:hidden; }
    .show-rail-fill { height:100%; width:100%; background:var(--night-accent); }
    .show-rail-seg.on .show-rail-k { color:var(--night-accent);
      box-shadow: inset 0 1px 0 var(--night-accent), inset 0 -1px 0 var(--night-accent);
      padding:4px 0; }
    .show-rail-seg.on .show-rail-track { height:3px; background:rgba(var(--night-accent-rgb), .28); }
    .show-rail-seg.past .show-rail-track { background:rgba(var(--night-accent-rgb), .28); }
    .show-rail-seg.stub { opacity:.5; }
    .show-rail.ribbon { height:22px; padding:0 28px; box-sizing:border-box; }
    .show-rail.ribbon .show-rail-seg { gap:2px; }
    .show-rail.ribbon .show-rail-k { font-size:8px; letter-spacing:.2em; line-height:10px;
      height:0; opacity:0; overflow:hidden; box-shadow:none; padding:0; }
    .show-rail.ribbon .show-rail-seg.on .show-rail-k { height:10px; opacity:1; }
    .show-rail.ribbon .show-rail-track { height:3px; }
    .show-rail.ribbon .show-rail-seg.on .show-rail-track { height:4px; }
    .night.on-run .show-rail { padding:0 22px 2px; }
    .night.on-run .show-rail.ribbon { padding:0 22px; }
    .night.on-run .show-ep { font-size:10px; }
    .night.on-run .show-mast-clock { font-size:18px; }
    .night.on-talk .show-rail, .night.on-intro .show-rail, .night.on-recap .show-rail {
      padding:2px 22px 8px; }
    .night.on-recap .show-rec { font-size:10px; }
    .night.on-recap .show-dot { width:8px; height:8px; }
    @keyframes fl-rec { 0%,100% { opacity:.25; } 50% { opacity:1; } }
`;
