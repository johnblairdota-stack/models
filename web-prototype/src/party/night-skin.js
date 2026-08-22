/**
 * Shared chrome for the sit-down night. DOM only — no THREE, no mansion, no flyover.
 */

export const ROLE_LABEL = {
  contestant: 'Contestant',
  cameraOp: 'Camera Op',
  focusPuller: 'Focus Puller',
  continuity: 'Continuity',
  editor: 'Editor',
  fanFavourite: 'Fan Favourite',
  stuntDouble: 'Stunt Double',
  glitched: 'Glitched',
  theStatic: 'The Static',
  methodActor: 'Method Actor',
  fixer: 'Fixer',
  plant: 'Plant',
  producer: 'Producer',
};

export function roleLabel(id) {
  return ROLE_LABEL[id] || (id ? String(id) : '—');
}

export function sideLabel(alignment) {
  if (alignment === 'evil') return 'PRODUCTION';
  if (alignment === 'good') return 'GOOD';
  return '';
}

export function playerName(players, id) {
  const p = (players || []).find((x) => x.id === id);
  return p?.name || id || '—';
}

export function injectNightSkin() {
  if (document.getElementById('rrr-night-skin')) return;
  const s = document.createElement('style');
  s.id = 'rrr-night-skin';
  s.textContent = `
    html, body { width:100%; height:100%; overflow:hidden; background:#07080c; }
    #boot.gone { display:none; }
    .night { position:fixed; inset:0; color:#e8eef6; font-family: ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(1200px 600px at 50% -10%, rgba(125,211,252,.08), transparent 55%),
        #07080c;
      display:flex; flex-direction:column; overflow:hidden; }
    .night * { box-sizing:border-box; }
    .night-top { display:flex; justify-content:space-between; align-items:flex-end; gap:16px;
      padding:18px 28px 10px; letter-spacing:.18em; text-transform:uppercase; }
    .night-brand { font-size:12px; color:#7dd3fc; font-weight:700; }
    .night-phase { font-size:13px; color:#cfe4f7; }
    .night-line { padding:0 28px 16px; color:#9fb0c3; font-size:18px; letter-spacing:.02em; max-width:52rem; }
    .night-main { flex:1; min-height:0; padding:8px 28px 24px; overflow:auto; }
    .night-code { font-size:clamp(48px, 10vw, 96px); font-weight:800; letter-spacing:.28em;
      color:#fff; line-height:1; font-variant-numeric:tabular-nums; }
    .night-sub { color:#6d7f93; font-size:13px; letter-spacing:.08em; text-transform:uppercase; margin-top:8px; }
    .night-row { display:flex; gap:28px; align-items:flex-start; flex-wrap:wrap; }
    .night-qr { background:#f4f7fb; padding:12px; border-radius:8px; flex:0 0 auto; }
    .night-qr svg { display:block; }
    .seats { display:grid; grid-template-columns:repeat(4, minmax(140px, 1fr)); gap:12px; margin-top:22px; }
    .seat { border:1px solid rgba(125,211,252,.18); border-radius:8px; padding:14px 14px 12px;
      min-height:86px; background:rgba(12,16,22,.7); }
    .seat.on { border-color:#7dd3fc; box-shadow:0 0 0 1px rgba(125,211,252,.35); }
    .seat.away { opacity:.55; }
    .seat .who { font-size:clamp(22px, 3vw, 36px); font-weight:700; letter-spacing:.02em; }
    .seat .meta { margin-top:6px; color:#7d8fa3; font-size:12px; letter-spacing:.1em; text-transform:uppercase; }
    .btn { appearance:none; border:0; cursor:pointer; font:inherit; letter-spacing:.12em;
      text-transform:uppercase; font-weight:700; padding:16px 22px; border-radius:6px;
      background:#7dd3fc; color:#071018; }
    .btn:disabled { opacity:.35; cursor:not-allowed; }
    .btn.ghost { background:transparent; color:#cfe4f7; border:1px solid rgba(207,228,247,.3); }
    .btn.wide { width:100%; }
    .actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:22px; }
    .err { color:#ff8a7a; white-space:pre-wrap; font-family:ui-monospace,Menlo,monospace; font-size:13px; }
    .ballot { display:flex; flex-direction:column; gap:14px; }
    .ballot .row { display:grid; grid-template-columns: 1fr auto 1fr; gap:20px; align-items:center;
      padding:22px 26px; background:rgba(12,16,22,.8); border:1px solid rgba(125,211,252,.16); border-radius:8px; }
    .ballot .who { font-size:clamp(40px, 7vw, 84px); font-weight:800; line-height:1; }
    .ballot .pick { font-size:clamp(36px, 6vw, 72px); font-weight:800; text-align:right; line-height:1.1; }
    .ballot.huge .who { font-size:clamp(52px, 9vw, 96px); }
    .ballot.huge .pick { font-size:clamp(44px, 8vw, 84px); }
    .ballot .arrow { color:#7dd3fc; letter-spacing:.2em; font-size:18px; text-transform:uppercase; }
    .pair-hero { margin:18px 0 8px; font-size:clamp(40px, 8vw, 96px); font-weight:800; line-height:1.15; }
    .recap { display:grid; grid-template-columns:1fr; gap:16px; max-width:900px; }
    .recap .fact { padding:28px 30px; border-radius:10px; background:rgba(12,16,22,.85);
      border:1px solid rgba(125,211,252,.2); }
    .recap .k { letter-spacing:.22em; text-transform:uppercase; color:#7dd3fc; font-size:14px; }
    .recap .v { font-size:clamp(40px, 8vw, 84px); font-weight:800; line-height:1; margin-top:8px; }
    .recap .v.bad { color:#ff8a7a; }
    .recap .v.ok { color:#9ff2c8; }
    .phone { padding:16px 16px 24px; }
    .phone-top { display:flex; justify-content:space-between; color:#8aa0b5; font-size:12px;
      letter-spacing:.16em; text-transform:uppercase; margin-bottom:14px; }
    .phone h1 { font-size:28px; margin:0 0 8px; letter-spacing:.04em; }
    .field { width:100%; padding:14px 12px; border-radius:6px; border:1px solid rgba(125,211,252,.25);
      background:#0c1016; color:#fff; font:inherit; font-size:20px; letter-spacing:.08em; margin:8px 0 14px; }
    .role-card { margin:12px 0; padding:28px 22px; border-radius:12px; background:#10151c;
      border:1px solid rgba(125,211,252,.25); min-height:200px; }
    .role-card .role { font-size:34px; font-weight:800; }
    .role-card .side { margin-top:10px; letter-spacing:.2em; font-size:18px; }
    .role-card .rule { margin-top:16px; color:#c2d0de; font-size:20px; line-height:1.35; }
    .pad { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
    .pad button { min-height:100px; font-size:18px; letter-spacing:.1em; text-transform:uppercase;
      font-weight:700; border:0; border-radius:10px; background:#151b24; color:#e8eef6; }
    .pad button.on { background:#7dd3fc; color:#071018; }
    .pick-list { display:flex; flex-direction:column; gap:8px; margin:8px 0 16px; }
    .pick-list button { text-align:left; padding:14px 16px; border-radius:8px; border:1px solid rgba(125,211,252,.2);
      background:#10151c; color:#e8eef6; font-size:18px; font-weight:700; }
    .pick-list button.on { border-color:#7dd3fc; background:#173044; }
    .hint { color:#7d8fa3; font-size:14px; line-height:1.45; }
    @media (max-width:720px) {
      .night-top, .night-line, .night-main { padding-left:16px; padding-right:16px; }
      .seats { grid-template-columns:repeat(2, 1fr); }
      .ballot .row { grid-template-columns:1fr; }
      .ballot .pick { text-align:left; }
    }
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
